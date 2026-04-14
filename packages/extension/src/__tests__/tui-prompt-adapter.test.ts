/**
 * Tests for the bridge's built-in TUI adapter behavior.
 * Tests the adapter contract using the same mock pattern as the wiring tests.
 * The TUI adapter is defined inline in bridge.ts session_start.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PromptBus, type PromptAdapter, type PromptRequest, type PromptResponse, type PromptClaim } from "../prompt-bus.js";

// Minimal TUI adapter reimplementation for testing the contract
// (mirrors the inline adapter in bridge.ts session_start)
function createTestTuiAdapter(mockUi: any, bus: PromptBus): PromptAdapter {
  const controllers = new Map<string, AbortController>();

  return {
    name: "tui",
    onRequest(prompt: PromptRequest): PromptClaim | null {
      const ac = new AbortController();
      controllers.set(prompt.id, ac);

      const present = async () => {
        try {
          let answer: any;
          if (prompt.type === "select") {
            answer = await mockUi.select(prompt.question, prompt.options, { signal: ac.signal });
          } else if (prompt.type === "input") {
            answer = await mockUi.input(prompt.question, prompt.defaultValue || "", { signal: ac.signal });
          } else if (prompt.type === "confirm") {
            answer = await mockUi.confirm(prompt.question, "", { signal: ac.signal });
          }
          if (!ac.signal.aborted) {
            const str = typeof answer === "boolean" ? (answer ? "true" : "false") : answer;
            bus.respond({ id: prompt.id, answer: str ?? undefined, cancelled: str == null, source: "tui" });
          }
        } catch {
          if (!ac.signal.aborted) {
            bus.respond({ id: prompt.id, cancelled: true, source: "tui" });
          }
        } finally {
          controllers.delete(prompt.id);
        }
      };
      present();
      return {};
    },
    onResponse(response: PromptResponse) {
      if (response.source !== "tui") {
        const ac = controllers.get(response.id);
        if (ac) { ac.abort(); controllers.delete(response.id); }
      }
    },
    onCancel(id: string) {
      const ac = controllers.get(id);
      if (ac) { ac.abort(); controllers.delete(id); }
    },
  };
}

function createMockUi() {
  const signals: Record<string, AbortSignal | undefined> = {};
  const resolvers: Record<string, { resolve: (v: any) => void }> = {};

  function makeMock(name: string) {
    return vi.fn().mockImplementation((_q: string, _a?: any, opts?: any) => {
      signals[name] = opts?.signal;
      return new Promise((resolve) => {
        resolvers[name] = { resolve };
        opts?.signal?.addEventListener("abort", () => resolve(undefined), { once: true });
      });
    });
  }

  return {
    select: makeMock("select"),
    input: makeMock("input"),
    confirm: makeMock("confirm"),
    _resolve: (method: string, value: any) => resolvers[method]?.resolve(value),
    _signal: (method: string) => signals[method],
  };
}

describe("Bridge TUI adapter", () => {
  let bus: PromptBus;
  let mockUi: ReturnType<typeof createMockUi>;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new PromptBus({ timeoutMs: 5000 });
    mockUi = createMockUi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls original select with question and options", () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    bus.request({ pipeline: "command", type: "select", question: "Pick:", options: ["A", "B"] });

    expect(mockUi.select).toHaveBeenCalledWith("Pick:", ["A", "B"], expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("calls original input with question and defaultValue", () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    bus.request({ pipeline: "command", type: "input", question: "Name:", defaultValue: "default" });

    expect(mockUi.input).toHaveBeenCalledWith("Name:", "default", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("calls original confirm with question", () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    bus.request({ pipeline: "command", type: "confirm", question: "Sure?" });

    expect(mockUi.confirm).toHaveBeenCalledWith("Sure?", "", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("responds via bus when user answers select", async () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    const promise = bus.request({ pipeline: "command", type: "select", question: "Q", options: ["A"] });

    mockUi._resolve("select", "A");
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.answer).toBe("A");
    expect(result.source).toBe("tui");
  });

  it("responds cancelled when user dismisses dialog", async () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    const promise = bus.request({ pipeline: "command", type: "select", question: "Q", options: ["A"] });

    mockUi._resolve("select", undefined);
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.cancelled).toBe(true);
  });

  it("converts boolean confirm to string", async () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    const promise = bus.request({ pipeline: "command", type: "confirm", question: "Sure?" });

    mockUi._resolve("confirm", true);
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.answer).toBe("true");
  });

  it("aborts TUI dialog when another adapter answers", async () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    const promise = bus.request({ pipeline: "command", type: "select", question: "Q", options: ["A"] });

    // External adapter answers
    const id = (mockUi.select.mock.calls[0] as any)?.[2]?.signal ? undefined : undefined;
    // Get the prompt id from the bus's pending
    bus.respond({ id: (bus as any).pending.keys().next().value, answer: "B", source: "dashboard" });
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.answer).toBe("B");
    expect(result.source).toBe("dashboard");
    expect(mockUi._signal("select")?.aborted).toBe(true);
  });

  it("aborts TUI dialog on cancel", async () => {
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    const promise = bus.request({ pipeline: "command", type: "select", question: "Q", options: ["A"] });

    const id = (bus as any).pending.keys().next().value;
    bus.cancel(id);
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result.cancelled).toBe(true);
    expect(mockUi._signal("select")?.aborted).toBe(true);
  });

  it("does not respond after being aborted", async () => {
    const respondSpy = vi.spyOn(bus, "respond");
    bus.registerAdapter(createTestTuiAdapter(mockUi, bus));
    bus.request({ pipeline: "command", type: "select", question: "Q", options: ["A"] });

    const id = (bus as any).pending.keys().next().value;
    // Dashboard answers first
    bus.respond({ id, answer: "B", source: "dashboard" });
    await vi.advanceTimersByTimeAsync(0);

    // TUI resolves after abort — should NOT call respond again
    mockUi._resolve("select", "A");
    await vi.advanceTimersByTimeAsync(0);

    // respond was called exactly once (by dashboard)
    expect(respondSpy.mock.calls.filter(c => c[0].id === id)).toHaveLength(1);
  });

  it("returns empty claim (no component)", () => {
    const adapter = createTestTuiAdapter(mockUi, bus);
    bus.registerAdapter(adapter);
    const claim = adapter.onRequest({
      id: "test", pipeline: "command", type: "select", question: "Q", options: ["A"],
    });
    expect(claim).toEqual({});
    expect(claim?.component).toBeUndefined();
  });
});
