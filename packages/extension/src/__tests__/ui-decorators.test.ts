import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshUiModules, subscribeUiInvalidate, type UiModulesBridgeCtx } from "../ui-modules.js";
import type { DecoratorDescriptor, ExtensionUiModule } from "@blackbelt-technology/pi-dashboard-shared/types.js";

/**
 * Phase-2 (`add-extension-ui-decorations`) bridge contract:
 *
 *   - `refreshUiModules` partitions probe.modules by `kind` — `management-modal`
 *     keeps flowing through `ui_modules_list`; the five Phase-2 kinds each
 *     forward as one `ext_ui_decorator` message.
 *   - Decorators MUST carry a `namespace` matching `/^[a-z0-9-]+$/`; malformed
 *     namespaces are dropped with a warning.
 *   - `(kind, namespace, id)` collisions within one probe → warning + last-write-wins.
 *   - `removed: true` is forwarded verbatim.
 *   - `ui:invalidate` re-runs the partitioned probe.
 *   - Per-session invalidate rate cap: ≤20 invalidations/second; excess
 *     coalesced to a trailing-edge probe with one warning.
 */

function createTestCtx(sessionId = "s1") {
  const listeners = new Map<string, Array<(...args: any[]) => any>>();
  const sent: any[] = [];

  const ctx: UiModulesBridgeCtx & { _sent: any[]; _listeners: typeof listeners } = {
    pi: {
      events: {
        on: vi.fn((event: string, fn: (...args: any[]) => any) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event)!.push(fn);
        }) as any,
        emit: vi.fn((event: string, ...args: any[]) => {
          const handlers = listeners.get(event) ?? [];
          for (const h of handlers) h(...args);
        }) as any,
      },
    },
    connection: {
      send: vi.fn((msg: unknown) => {
        sent.push(msg);
      }) as any,
    },
    getSessionId: () => sessionId,
    _sent: sent,
    _listeners: listeners,
  };
  return ctx;
}

const sampleModule = (id: string, command: string): ExtensionUiModule => ({
  kind: "management-modal",
  id,
  command,
  title: id,
  view: { kind: "table", dataEvent: `${id}:rows`, fields: [{ key: "id", label: "ID", kind: "text" }] },
});

const footerSeg = (namespace: string, id: string, text: string): DecoratorDescriptor => ({
  kind: "footer-segment",
  namespace,
  id,
  payload: { text },
});

const gate = (namespace: string, id: string, flowId: string, available: boolean, reason?: string): DecoratorDescriptor => ({
  kind: "gate",
  namespace,
  id,
  payload: { flowId, available, reason },
});

const toast = (namespace: string, id: string, message: string): DecoratorDescriptor => ({
  kind: "toast",
  namespace,
  id,
  payload: { level: "info", message },
});

describe("refreshUiModules — Phase-2 partitioning", () => {
  it("partitions a mixed probe into one ui_modules_list (modal-only) plus one ext_ui_decorator per decorator", () => {
    const ctx = createTestCtx("S");
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: any[] }) => {
        probe.modules.push(sampleModule("judo-status", "/judo:status"));
        probe.modules.push(footerSeg("judo", "model-state", "3 mut"));
        probe.modules.push(gate("judo", "save", "judo:save", false, "Not in workspace"));
        probe.modules.push(toast("flows", "done", "Flow finished"));
      },
    ]);

    refreshUiModules(ctx);

    // Exactly one ui_modules_list, exactly three ext_ui_decorator.
    const moduleMsgs = ctx._sent.filter((m) => m.type === "ui_modules_list");
    const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
    expect(moduleMsgs).toHaveLength(1);
    expect(decoratorMsgs).toHaveLength(3);

    expect(moduleMsgs[0]).toMatchObject({
      type: "ui_modules_list",
      sessionId: "S",
      modules: [expect.objectContaining({ id: "judo-status", kind: "management-modal" })],
    });

    const kinds = decoratorMsgs.map((m) => m.descriptor.kind).sort();
    expect(kinds).toEqual(["footer-segment", "gate", "toast"]);
    for (const m of decoratorMsgs) {
      expect(m.sessionId).toBe("S");
      expect(m.removed).toBeUndefined();
    }
  });

  it("forwards no decorator messages when only modal modules are pushed", () => {
    const ctx = createTestCtx();
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: any[] }) => {
        probe.modules.push(sampleModule("a", "/a"));
      },
    ]);
    refreshUiModules(ctx);
    expect(ctx._sent.filter((m) => m.type === "ext_ui_decorator")).toHaveLength(0);
    expect(ctx._sent.filter((m) => m.type === "ui_modules_list")).toHaveLength(1);
  });

  it("forwards decorator-only probe with empty modules list", () => {
    const ctx = createTestCtx();
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: any[] }) => {
        probe.modules.push(footerSeg("judo", "f1", "x"));
        probe.modules.push(footerSeg("judo", "f2", "y"));
      },
    ]);
    refreshUiModules(ctx);
    const modulesMsg = ctx._sent.find((m) => m.type === "ui_modules_list");
    expect(modulesMsg).toBeDefined();
    expect(modulesMsg.modules).toEqual([]);
    expect(ctx._sent.filter((m) => m.type === "ext_ui_decorator")).toHaveLength(2);
  });

  it("rejects decorators with malformed namespace and warns", () => {
    const ctx = createTestCtx();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      ctx._listeners.set("ui:list-modules", [
        (probe: { modules: any[] }) => {
          probe.modules.push(footerSeg("", "id1", "bad-empty"));
          probe.modules.push(footerSeg("UPPER", "id2", "bad-case"));
          probe.modules.push(footerSeg("with space", "id3", "bad-space"));
          probe.modules.push(footerSeg("ok-ns", "id4", "good"));
        },
      ]);
      refreshUiModules(ctx);

      const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
      expect(decoratorMsgs).toHaveLength(1);
      expect(decoratorMsgs[0].descriptor.namespace).toBe("ok-ns");
      // Three bad descriptors → at least one warning each (or one combined).
      expect(warn).toHaveBeenCalled();
      const allWarnText = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(allWarnText).toMatch(/namespace/i);
    } finally {
      warn.mockRestore();
    }
  });

  it("collisions on (kind, namespace, id) within one probe warn once and last-write-wins", () => {
    const ctx = createTestCtx();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      ctx._listeners.set("ui:list-modules", [
        (probe: { modules: any[] }) => {
          probe.modules.push(footerSeg("judo", "x", "first"));
          probe.modules.push(footerSeg("judo", "x", "second"));
          probe.modules.push(footerSeg("judo", "x", "third"));
        },
      ]);
      refreshUiModules(ctx);

      const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
      expect(decoratorMsgs).toHaveLength(1);
      expect((decoratorMsgs[0].descriptor.payload as any).text).toBe("third");
      // One warning per colliding key, regardless of how many duplicates.
      const collisionWarnings = warn.mock.calls.filter((c) => /footer-segment:judo:x/.test(String(c[0])));
      expect(collisionWarnings.length).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("different namespaces with the same id are NOT a collision", () => {
    const ctx = createTestCtx();
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: any[] }) => {
        probe.modules.push(footerSeg("judo", "model-state", "judo-text"));
        probe.modules.push(footerSeg("flows", "model-state", "flows-text"));
      },
    ]);
    refreshUiModules(ctx);
    const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
    expect(decoratorMsgs).toHaveLength(2);
    const namespaces = decoratorMsgs.map((m) => m.descriptor.namespace).sort();
    expect(namespaces).toEqual(["flows", "judo"]);
  });

  it("forwards `removed: true` verbatim on decorator descriptors", () => {
    const ctx = createTestCtx();
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: any[] }) => {
        probe.modules.push({ ...gate("judo", "save", "judo:save", true), removed: true });
      },
    ]);
    refreshUiModules(ctx);
    const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
    expect(decoratorMsgs).toHaveLength(1);
    expect(decoratorMsgs[0].removed).toBe(true);
    expect(decoratorMsgs[0].descriptor.kind).toBe("gate");
  });

  it("does not regress Phase-1 module-only probes", () => {
    // Mirrors the Phase-1 test "emits ui:list-modules and forwards collected
    // modules as ui_modules_list" — Phase-2 partitioning MUST be a no-op when
    // no decorators are pushed.
    const ctx = createTestCtx("session-A");
    ctx._listeners.set("ui:list-modules", [
      (probe: { modules: ExtensionUiModule[] }) => {
        probe.modules.push(sampleModule("judo-status", "/judo:status"));
        probe.modules.push(sampleModule("ragger-workspaces", "/ragger:workspaces"));
      },
    ]);
    refreshUiModules(ctx);
    const moduleMsgs = ctx._sent.filter((m) => m.type === "ui_modules_list");
    expect(moduleMsgs).toHaveLength(1);
    expect(moduleMsgs[0].modules).toHaveLength(2);
    expect(ctx._sent.filter((m) => m.type === "ext_ui_decorator")).toHaveLength(0);
  });
});

describe("subscribeUiInvalidate — Phase-2 re-forwarding", () => {
  it("re-runs the partitioned probe on every ui:invalidate (leading + trailing under throttle)", () => {
    vi.useFakeTimers();
    try {
      const ctx = createTestCtx();
      let counter = 0;
      ctx._listeners.set("ui:list-modules", [
        (probe: { modules: any[] }) => {
          counter++;
          probe.modules.push(footerSeg("judo", "model-state", `count=${counter}`));
        },
      ]);
      subscribeUiInvalidate(ctx);

      // Leading-edge probe.
      ctx.pi.events!.emit("ui:invalidate", { id: "model-state" });
      // Coalesced into trailing-edge probe — flush by advancing timers past
      // the 50ms throttle window.
      ctx.pi.events!.emit("ui:invalidate", { id: "model-state" });
      vi.advanceTimersByTime(100);

      const decoratorMsgs = ctx._sent.filter((m) => m.type === "ext_ui_decorator");
      expect(decoratorMsgs).toHaveLength(2);
      expect((decoratorMsgs[0].descriptor.payload as any).text).toBe("count=1");
      expect((decoratorMsgs[1].descriptor.payload as any).text).toBe("count=2");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Per-session ui:invalidate rate cap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a 100-invalidation burst to a small bounded number of probes with exactly one warning", () => {
    const ctx = createTestCtx();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let probeCount = 0;
      ctx._listeners.set("ui:list-modules", [
        (probe: { modules: any[] }) => {
          probeCount++;
          probe.modules.push(footerSeg("judo", "model-state", `p${probeCount}`));
        },
      ]);

      subscribeUiInvalidate(ctx);

      // Fire 100 invalidations within ~200ms (well over the 20/sec cap).
      for (let i = 0; i < 100; i++) {
        ctx.pi.events!.emit("ui:invalidate", { id: "x" });
        vi.advanceTimersByTime(2);
      }
      // Allow any trailing-edge timer to fire.
      vi.advanceTimersByTime(2000);

      // Probes are bounded — at minimum 1 (the first), at most a handful, NOT 100.
      expect(probeCount).toBeGreaterThanOrEqual(1);
      expect(probeCount).toBeLessThanOrEqual(10);

      // Exactly one rate-cap warning per offending burst.
      const rateWarnings = warn.mock.calls.filter((c) => /rate|invalidat/i.test(String(c[0])));
      expect(rateWarnings.length).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });
});
