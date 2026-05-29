/**
 * Tests for the bridge's shutdown extension command.
 *
 * Negative-assertion model: pi's ExtensionAPI does NOT expose
 * clearSteeringQueue / clearFollowUpQueue to extensions (verified through
 * pi 0.76.0). The bridge therefore SHALL NOT call them. Shadow queues
 * persist across shutdown because pi's real queues persist until process
 * exit. No final queue_update is emitted.
 *
 * Pure-model mirror of bridge.ts `shutdown` extension command.
 *
 * Spec: openspec/specs/mid-turn-prompt-queue/spec.md — requirement
 * "Session shutdown invokes cachedCtx.shutdown directly".
 *
 * See change: honest-mid-turn-queue-surface.
 */
import { describe, it, expect, vi } from "vitest";

interface ShadowQueue {
  steering: string[];
  followUp: string[];
}

interface PiLike {
  // Defined as optional so tests can verify they are NEVER invoked even
  // when present on the pi object (e.g. if a future pi version adds them
  // back to the ExtensionAPI surface — the dashboard's current honest
  // policy is to ignore them).
  clearSteeringQueue?: () => void;
  clearFollowUpQueue?: () => void;
}

interface CachedCtxLike {
  shutdown?: () => void;
}

/**
 * Pure version of the shutdown extension command. Mirrors bridge.ts 1:1.
 */
function makeShutdown(opts: {
  pi: PiLike;
  cachedCtx: CachedCtxLike | null;
  queue: ShadowQueue;
  onEmit: (snapshot: { steering: string[]; followUp: string[] }) => void;
  onProcessExit: () => void;
  callLog: string[];
}) {
  return () => {
    // Pi exposes no clear*Queue to extensions; shadow stays as-is.
    if (opts.cachedCtx?.shutdown) {
      opts.callLog.push("cachedCtx.shutdown");
      opts.cachedCtx.shutdown();
    }
    opts.callLog.push("setTimeout(process.exit)");
    opts.onProcessExit();
  };
}

describe("bridge shutdown: invokes cachedCtx.shutdown directly", () => {
  it("non-empty shadows: shadows stay populated, no clear*, no emit", () => {
    const queue: ShadowQueue = { steering: ["focus on X"], followUp: ["run tests"] };
    const onEmit = vi.fn();
    const clearSteer = vi.fn();
    const clearFollow = vi.fn();
    const pi: PiLike = { clearSteeringQueue: clearSteer, clearFollowUpQueue: clearFollow };
    const cachedCtx: CachedCtxLike = { shutdown: vi.fn() };

    makeShutdown({ pi, cachedCtx, queue, onEmit, onProcessExit: vi.fn(), callLog: [] })();

    // Shadows preserved — pi's real queues also persist until process exit
    expect(queue.steering).toEqual(["focus on X"]);
    expect(queue.followUp).toEqual(["run tests"]);
    // Bridge does NOT call pi.clear* — they are no-ops via the ExtensionAPI
    expect(clearSteer).not.toHaveBeenCalled();
    expect(clearFollow).not.toHaveBeenCalled();
    // No misleading "queues drained" emission
    expect(onEmit).not.toHaveBeenCalled();
  });

  it("empty shadows: still no clear*, no emit, still runs cachedCtx.shutdown + safety net", () => {
    const queue: ShadowQueue = { steering: [], followUp: [] };
    const onEmit = vi.fn();
    const clearSteer = vi.fn();
    const clearFollow = vi.fn();
    const pi: PiLike = { clearSteeringQueue: clearSteer, clearFollowUpQueue: clearFollow };
    const cachedShutdown = vi.fn();
    const onProcessExit = vi.fn();

    makeShutdown({
      pi,
      cachedCtx: { shutdown: cachedShutdown },
      queue,
      onEmit,
      onProcessExit,
      callLog: [],
    })();

    expect(clearSteer).not.toHaveBeenCalled();
    expect(clearFollow).not.toHaveBeenCalled();
    expect(onEmit).not.toHaveBeenCalled();
    expect(cachedShutdown).toHaveBeenCalledTimes(1);
    expect(onProcessExit).toHaveBeenCalledTimes(1);
  });

  it("pi version with clear* methods present: still NOT called (honest policy)", () => {
    // Even if a future pi build re-adds the methods to the ExtensionAPI,
    // the current bridge SHALL NOT call them. A future OpenSpec change
    // (restore-mid-turn-queue-mutation) would re-introduce calls together
    // with the protocol + UI affordances.
    const queue: ShadowQueue = { steering: ["a"], followUp: ["b"] };
    const clearSteer = vi.fn();
    const clearFollow = vi.fn();
    const pi: PiLike = { clearSteeringQueue: clearSteer, clearFollowUpQueue: clearFollow };

    makeShutdown({
      pi,
      cachedCtx: { shutdown: vi.fn() },
      queue,
      onEmit: vi.fn(),
      onProcessExit: vi.fn(),
      callLog: [],
    })();

    expect(clearSteer).not.toHaveBeenCalled();
    expect(clearFollow).not.toHaveBeenCalled();
    expect(queue).toEqual({ steering: ["a"], followUp: ["b"] });
  });

  it("order of operations: cachedCtx.shutdown → setTimeout(process.exit) only", () => {
    const queue: ShadowQueue = { steering: ["a"], followUp: ["b"] };
    const callLog: string[] = [];
    const pi: PiLike = { clearSteeringQueue: vi.fn(), clearFollowUpQueue: vi.fn() };
    const cachedCtx: CachedCtxLike = { shutdown: vi.fn() };

    makeShutdown({ pi, cachedCtx, queue, onEmit: vi.fn(), onProcessExit: vi.fn(), callLog })();

    expect(callLog).toEqual([
      "cachedCtx.shutdown",
      "setTimeout(process.exit)",
    ]);
  });

  it("cachedCtx is null: safety-net process.exit still fires", () => {
    const queue: ShadowQueue = { steering: ["a"], followUp: [] };
    const onProcessExit = vi.fn();
    const pi: PiLike = { clearSteeringQueue: vi.fn(), clearFollowUpQueue: vi.fn() };

    makeShutdown({
      pi,
      cachedCtx: null,
      queue,
      onEmit: vi.fn(),
      onProcessExit,
      callLog: [],
    })();

    expect(onProcessExit).toHaveBeenCalledTimes(1);
  });
});
