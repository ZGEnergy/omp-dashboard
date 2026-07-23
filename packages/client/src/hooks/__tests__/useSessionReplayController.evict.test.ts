import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it, vi } from "vitest";
import { SessionReplayController } from "../useSessionReplayController.js";

const entry = (seq: number) => ({ seq, event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent });

function frame(requestId: string, events = [entry(1)], isLast = false, sourceGeneration = "source-a") {
  return { type: "event_replay" as const, sessionId: "s", requestId, sourceGeneration, replayKind: "cold" as const, events, isLast, windowMinSeq: events[0]?.seq ?? null, windowMaxSeq: events.at(-1)?.seq ?? null, retainedMinSeq: 1, hasMoreOlder: false, partialHead: false, historyTruncated: false };
}

function olderFrame(requestId: string, events: ReturnType<typeof entry>[], isLast: boolean, sourceGeneration = "source-a") {
  return { type: "event_replay" as const, sessionId: "s", requestId, sourceGeneration, replayKind: "older" as const, events, isLast, windowMinSeq: events[0]?.seq ?? null, windowMaxSeq: events.at(-1)?.seq ?? null, retainedMinSeq: 1, hasMoreOlder: false, partialHead: false, historyTruncated: false };
}

describe("eviction wiring", () => {
  it("calls effects.evict (not replace) with the ledger floor when the head is trimmed on a live frame", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), window: vi.fn(), trimmed: vi.fn(), replace: vi.fn(), evict: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const budget = JSON.stringify(entry(1)).length * 2;
    const controller = new (SessionReplayController as any)(effects, { maxRetainedBytes: budget });
    const cold = controller.begin("s", "cold", "source-a");
    controller.handle(frame(cold.requestId!, [entry(1), entry(2)], true));

    // ready baseline established; a subsequent live frame trips the byte cap.
    controller.handle({ type: "event", sessionId: "s", seq: 3, event: entry(3).event });

    expect(controller.ledger("s").status).toBe("ready");
    expect(effects.trimmed).toHaveBeenCalledWith("s", 2);
    expect(effects.evict).toHaveBeenCalled();
    expect(effects.evict.mock.calls.at(-1)![0]).toBe("s");
    expect(effects.evict.mock.calls.at(-1)![1]).toBe(2);
    expect(effects.apply).toHaveBeenLastCalledWith("s", [entry(3)]);
    expect(effects.replace).not.toHaveBeenCalled();
  });

  it("never evicts while ledger status is not ready (in-flight replay)", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), window: vi.fn(), trimmed: vi.fn(), replace: vi.fn(), evict: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const budget = JSON.stringify(entry(1)).length * 2;
    const controller = new (SessionReplayController as any)(effects, { maxRetainedBytes: budget });
    const cold = controller.begin("s", "cold", "source-a");

    // A non-terminal (isLast:false) oversized cold frame trips the byte cap
    // while the ledger is still mid-replay ("cold"), not "ready".
    controller.handle(frame(cold.requestId!, [entry(1), entry(2), entry(3)], false));

    expect(controller.ledger("s").status).toBe("cold");
    expect(effects.evict).not.toHaveBeenCalled();
  });

  it("does not evict on the Load-Older rebuild path, even when the older page trips the byte cap", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), window: vi.fn(), trimmed: vi.fn(), replace: vi.fn(), evict: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const budget = JSON.stringify(entry(1)).length * 2;
    const controller = new (SessionReplayController as any)(effects, { maxRetainedBytes: budget });

    // Establish a ready baseline holding seq 3-4 (already at the byte cap).
    const cold = controller.begin("s", "cold", "source-a");
    controller.handle(frame(cold.requestId!, [entry(3), entry(4)], true));
    expect(controller.ledger("s").status).toBe("ready");

    // Page backward: load seq 1-2. Admitting them pushes retained bytes over
    // budget, tripping trimRetained (evictedHead) on the older rebuild path.
    const older = controller.begin("s", "older", "source-a");
    controller.handle(olderFrame(older.requestId!, [entry(1), entry(2)], true));

    expect(controller.ledger("s").status).toBe("ready");
    // The terminal older frame must rebuild via replace, and must NOT re-evict
    // the just-loaded older rows — that would re-prune the page the user just
    // paged in (see #73 independent review).
    expect(effects.replace).toHaveBeenCalled();
    expect(effects.evict).not.toHaveBeenCalled();
  });
});
