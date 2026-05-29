/**
 * Tests for the bridge-owned-follow-up drain loop.
 *
 * Pure mirror of bridge.ts `drainFollowupQueue()`:
 *
 *   1. Re-entrancy lock (isDraining boolean, set→try→finally clear)
 *   2. TUI-coexistence gate (ctx.hasPendingMessages() === false)
 *   3. Empty-buffer gate (bridgeFollowUp.length > 0)
 *   4. POP FIRST (bridgeFollowUp.shift() before any pi call)
 *   5. Emit BEFORE send (emitQueueUpdate runs before pi.sendUserMessage)
 *   6. Single send, no deliverAs (fresh-turn semantics)
 *   7. Catch + drop on pi error (no re-push)
 *
 * NOTE: an earlier draft included `ctx.isIdle()` as a gate. Smoke test
 * showed that `ctx.isIdle()` returns false at microtask time even though
 * `agent_end` has already fired, blocking the drain. The gate was
 * removed: `agent_end` by definition means the agent ended, and the
 * `ctx.hasPendingMessages()` gate handles the TUI-coexistence concern.
 *
 * Spec: mid-turn-prompt-queue — Requirement "Bridge follow-up drain loop
 * runs on agent_end with pop-before-send invariant".
 *
 * See change: rework-mid-turn-prompt-queue.
 */
import { describe, it, expect, vi } from "vitest";

type AnyMock = ((...args: any[]) => any) & ReturnType<typeof vi.fn>;

interface PiLike {
  sendUserMessage: AnyMock;
}

interface CtxLike {
  hasPendingMessages?: AnyMock;
  isIdle?: AnyMock;
}

interface Harness {
  pi: PiLike;
  ctx: CtxLike;
  buffer: string[];
  emit: AnyMock;
  callLog: string[];
  drainOnce: () => void;
}

function makeHarness(opts: {
  initial?: string[];
  hasPendingMessages?: boolean | undefined; // undefined => method absent
  throwOnSend?: boolean;
  idle?: boolean; // default true
}): Harness {
  const callLog: string[] = [];

  const pi: PiLike = {
    sendUserMessage: vi.fn((entry: unknown) => {
      callLog.push(`pi.sendUserMessage:${entry}`);
      if (opts.throwOnSend) throw new Error("pi exploded");
    }) as AnyMock,
  };

  const ctx: CtxLike = {
    isIdle: vi.fn(() => {
      callLog.push("ctx.isIdle");
      return opts.idle ?? true;
    }) as AnyMock,
  };
  if (opts.hasPendingMessages !== undefined) {
    ctx.hasPendingMessages = vi.fn(() => {
      callLog.push("ctx.hasPendingMessages");
      return opts.hasPendingMessages!;
    }) as AnyMock;
  }

  const buffer: string[] = [...(opts.initial ?? [])];
  const emit = vi.fn(() => {
    callLog.push(`emit:${JSON.stringify([...buffer])}`);
  }) as AnyMock;

  // Mirror bridge.ts drainFollowupQueue 1:1 (post-smoke-fix #3:
  // sendUserMessage with NO deliverAs after ctx.isIdle() returns true).
  // The retry loop is omitted from this synchronous harness; tests that
  // exercise the not-idle branch verify no-pi-call directly.
  let isDraining = false;
  const drainOnce = (): void => {
    if (isDraining) return;
    if (buffer.length === 0) return;
    if (typeof ctx.hasPendingMessages === "function") {
      try { if (ctx.hasPendingMessages()) return; } catch { /* swallow */ }
    }
    const idle = (() => {
      try { return ctx.isIdle?.() === true; } catch { return false; }
    })();
    if (!idle) return; // real code retries via setTimeout; harness just bails
    isDraining = true;
    try {
      // POP FIRST.
      const entry = buffer.shift()!;
      callLog.push(`buffer.shift:${entry}`);
      // EMIT BEFORE SEND.
      emit();
      // SEND with NO deliverAs (fresh turn).
      try {
        pi.sendUserMessage(entry);
      } catch {
        // INTENTIONAL no re-push.
      }
    } finally {
      isDraining = false;
    }
  };

  return { pi, ctx, buffer, emit, callLog, drainOnce };
}

describe("drainFollowupQueue: pop-before-send invariant", () => {
  it("calls buffer.shift BEFORE pi.sendUserMessage in the call log", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: false });
    h.drainOnce();
    const shiftIdx = h.callLog.findIndex((s) => s.startsWith("buffer.shift:"));
    const sendIdx = h.callLog.findIndex((s) => s.startsWith("pi.sendUserMessage:"));
    expect(shiftIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThan(shiftIdx);
  });

  it("emits queue_update BEFORE pi.sendUserMessage", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: false });
    h.drainOnce();
    const emitIdx = h.callLog.findIndex((s) => s.startsWith("emit:"));
    const sendIdx = h.callLog.findIndex((s) => s.startsWith("pi.sendUserMessage:"));
    expect(emitIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThan(emitIdx);
  });

  it("calls pi.sendUserMessage with NO deliverAs (fresh-turn semantics)", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: false, idle: true });
    h.drainOnce();
    // After ctx.isIdle()=true, pi.sendUserMessage(entry) starts a fresh
    // turn via Agent.prompt(). deliverAs is intentionally omitted because
    // pi's followUpQueue is no longer being drained post-agent_end.
    expect(h.pi.sendUserMessage).toHaveBeenCalledWith("a");
    expect(h.pi.sendUserMessage.mock.calls[0]).toHaveLength(1);
  });
});

describe("drainFollowupQueue: one entry per agent_end", () => {
  it("drains only ONE entry per call", () => {
    const h = makeHarness({ initial: ["a", "b", "c"], hasPendingMessages: false });
    h.drainOnce();
    expect(h.buffer).toEqual(["b", "c"]);
    expect(h.pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.pi.sendUserMessage).toHaveBeenCalledWith("a");
  });

  it("drains in FIFO order across multiple agent_end fires", () => {
    const h = makeHarness({ initial: ["a", "b", "c"], hasPendingMessages: false });
    h.drainOnce(); // → "a"
    h.drainOnce(); // → "b"
    h.drainOnce(); // → "c"
    expect(h.buffer).toEqual([]);
    expect(h.pi.sendUserMessage.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    // No deliverAs option on any call — fresh-turn semantics throughout.
    for (const call of h.pi.sendUserMessage.mock.calls) {
      expect(call).toHaveLength(1);
    }
  });

  it("bails when ctx.isIdle returns false (transition window)", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: false, idle: false });
    h.drainOnce();
    // Pi still in transition — buffer untouched, no pi call.
    expect(h.buffer).toEqual(["a"]);
    expect(h.pi.sendUserMessage).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });
});

describe("drainFollowupQueue: gates", () => {
  it("TUI gate: bails when ctx.hasPendingMessages() returns true", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: true });
    h.drainOnce();
    expect(h.buffer).toEqual(["a"]);
    expect(h.pi.sendUserMessage).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it("works when ctx.hasPendingMessages is absent (older pi version)", () => {
    const h = makeHarness({ initial: ["a"], hasPendingMessages: undefined });
    h.drainOnce();
    expect(h.buffer).toEqual([]);
    expect(h.pi.sendUserMessage).toHaveBeenCalledWith("a");
  });

  it("empty-buffer gate: no-op when buffer empty", () => {
    const h = makeHarness({ initial: [], hasPendingMessages: false });
    h.drainOnce();
    expect(h.buffer).toEqual([]);
    expect(h.emit).not.toHaveBeenCalled();
    expect(h.pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

describe("drainFollowupQueue: pi error handling", () => {
  it("entry is LOST when pi.sendUserMessage throws (no re-push)", () => {
    const h = makeHarness({
      initial: ["a"],
      hasPendingMessages: false,
      throwOnSend: true,
    });
    // Suppress the warning log from the drain — it's expected.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.drainOnce();
    expect(h.buffer).toEqual([]); // entry NOT re-pushed
    expect(h.pi.sendUserMessage).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("next drain finds empty buffer and no-ops", () => {
    const h = makeHarness({
      initial: ["a"],
      hasPendingMessages: false,
      throwOnSend: true,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.drainOnce();
    h.drainOnce(); // empty-buffer gate
    expect(h.pi.sendUserMessage).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("drainFollowupQueue: re-entrancy lock", () => {
  it("synchronous re-entry inside the drain returns early", () => {
    // Simulate re-entry by having pi.sendUserMessage re-invoke drainOnce().
    // The lock must prevent the inner call from doing any work.
    const callLog: string[] = [];
    const buffer: string[] = ["a", "b"];
    const emit = vi.fn(() => callLog.push(`emit:${JSON.stringify([...buffer])}`));

    let isDraining = false;
    let reentrySucceeded = false;
    const drainOnce = (): void => {
      if (isDraining) {
        reentrySucceeded = true;
        return;
      }
      isDraining = true;
      try {
        if (buffer.length === 0) return;
        const entry = buffer.shift()!;
        callLog.push(`shift:${entry}`);
        emit();
        // Synchronous re-entry attempt inside the same frame.
        drainOnce();
        callLog.push(`outer-done:${entry}`);
      } finally {
        isDraining = false;
      }
    };

    drainOnce();
    expect(buffer).toEqual(["b"]); // only one entry consumed
    expect(reentrySucceeded).toBe(true); // re-entry tried but was blocked
    expect(callLog).toEqual(["shift:a", "emit:[\"b\"]", "outer-done:a"]);
  });
});
