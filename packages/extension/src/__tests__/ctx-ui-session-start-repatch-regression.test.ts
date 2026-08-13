import { describe, it, expect, vi } from "vitest";
import { getOrCreatePristineOriginals } from "../ctx-ui-originals.js";
import { PromptBus } from "../prompt-bus.js";

describe("ctx.ui session_start re-patch & error handling regression (#115)", () => {
  it("(a) getOrCreatePristineOriginals returns identical function refs across multiple captures on the same ui object", () => {
    const nativeSelect = vi.fn().mockResolvedValue("option1");
    const nativeInput = vi.fn().mockResolvedValue("hello");
    const mockUi = {
      select: nativeSelect,
      input: nativeInput,
      confirm: vi.fn(),
      editor: vi.fn(),
      notify: vi.fn(),
    };

    const orig1 = getOrCreatePristineOriginals(mockUi);
    expect(orig1.select).toBeDefined();
    expect(orig1.input).toBeDefined();

    // Mutate mockUi methods to simulate patching
    const patchedSelect = vi.fn();
    (patchedSelect as any).__isPromptBusWrapper = true;
    mockUi.select = patchedSelect;

    const orig2 = getOrCreatePristineOriginals(mockUi);
    expect(orig2).toBe(orig1);
    expect(orig2.select).toBe(orig1.select);
    // orig2.select should call nativeSelect, NOT patchedSelect
    orig2.select!("q", ["a"]);
    expect(nativeSelect).toHaveBeenCalledWith("q", ["a"]);
    expect(patchedSelect).not.toHaveBeenCalled();
  });

  it("warns when capturing an un-cached ui object with an already-wrapped method", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrappedSelect = vi.fn();
    (wrappedSelect as any).__isPromptBusWrapper = true;
    const uiWithWrapped = { select: wrappedSelect };

    getOrCreatePristineOriginals(uiWithWrapped);

    expect(warnSpy).toHaveBeenCalledWith(
      "[bridge] getOrCreatePristineOriginals: captured an already-wrapped ui method"
    );
    warnSpy.mockRestore();
  });


  it("(b) after N (>=10) patch cycles, invoking select does not RangeError or recurse through previous wrappers", async () => {
    let nativeCallCount = 0;
    const mockNativeSelect = vi.fn().mockImplementation(async () => {
      nativeCallCount++;
      return "selected_val";
    });

    const mockUi: any = {
      select: mockNativeSelect,
      input: vi.fn(),
      confirm: vi.fn(),
      editor: vi.fn(),
      notify: vi.fn(),
    };

    // Simulate 15 consecutive session_start patch cycles using getOrCreatePristineOriginals
    const buses: PromptBus[] = [];
    for (let i = 0; i < 15; i++) {
      const bus = new PromptBus();
      buses.push(bus);
      const originals = getOrCreatePristineOriginals(mockUi);

      // Register TUI adapter on current bus
      bus.registerAdapter({
        name: "tui",
        onRequest(prompt) {
          const ac = new AbortController();
          const present = async () => {
            try {
              if (prompt.type === "select" && originals.select) {
                const ans = await originals.select(prompt.question, prompt.options || [], { signal: ac.signal });
                bus.respond({ id: prompt.id, answer: ans, cancelled: ans === undefined, source: "tui" });
              }
            } catch (err) {
              bus.respond({ id: prompt.id, cancelled: false, error: String(err), source: "tui" });
            }
          };
          present();
          return {};
        },
        onResponse() {},
        onCancel() {},
      });

      // Patch ctx.ui.select as bridge.ts does
      const wrapper = (title: string, options: string[], opts?: any) =>
        bus
          .request({ pipeline: "command", type: "select", question: title, options }, opts?.signal)
          .then((r) => (r.cancelled ? undefined : r.answer));
      (wrapper as any).__isPromptBusWrapper = true;
      mockUi.select = wrapper;
    }

    // Now call mockUi.select (which points to bus #14)
    nativeCallCount = 0;
    const res = await mockUi.select("Pick one", ["a", "b"]);

    expect(res).toBe("selected_val");
    // Should call native select exactly ONCE, not 15 times through nested wrappers
    expect(nativeCallCount).toBe(1);
  });

  it("(c) throwing adapter -> response.cancelled === false and response.error set (not user-cancelled)", async () => {
    const bus = new PromptBus();

    // Adapter that throws an error when presenting (e.g. native select throws)
    bus.registerAdapter({
      name: "failing-tui",
      onRequest(prompt) {
        const present = async () => {
          try {
            await Promise.resolve(); // Ensure async tick after bus.pending is set
            throw new Error("TUI renderer crashed");
          } catch (err) {
            bus.respond({
              id: prompt.id,
              cancelled: false,
              error: err instanceof Error ? err.message : String(err),
              source: "tui",
            });
          }
        };
        present();
        return {};
      },
      onResponse() {},
      onCancel() {},
    });

    const response = await bus.request({
      pipeline: "command",
      type: "select",
      question: "Test question",
    });

    expect(response.cancelled).toBe(false);
    expect(response.error).toBe("TUI renderer crashed");
  });
});
