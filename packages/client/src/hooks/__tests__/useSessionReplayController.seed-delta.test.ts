import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it, vi } from "vitest";
import { SessionReplayController } from "../useSessionReplayController.js";

const userTurn = (seq: number) => ({
  seq,
  event: { sessionId: "s", eventType: "message_start", timestamp: seq, data: { message: { role: "user", content: "hi" } } } as unknown as DashboardEvent,
});
const entry = (seq: number) => ({ seq, event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent });

function deltaFrame(requestId: string, events: ReturnType<typeof entry>[], isLast = true, sourceGeneration = "source-a") {
  return {
    type: "event_replay" as const,
    sessionId: "s",
    requestId,
    sourceGeneration,
    replayKind: "delta" as const,
    events,
    isLast,
    windowMinSeq: events[0]?.seq ?? null,
    windowMaxSeq: events.at(-1)?.seq ?? null,
    retainedMinSeq: events[0]?.seq ?? null,
    hasMoreOlder: false,
    partialHead: false,
    historyTruncated: false,
  };
}

describe("SessionReplayController — seed-then-delta cold start (#48 Slice 2 Task 2.1)", () => {
  it("issues a delta from the seeded cursor and appends only events > cachedMaxSeq", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);

    // Seed the ledger from a durable-cache hit covering seq 1..10 (a user
    // turn is present, satisfying seedCached's admission gate).
    const seeded = [userTurn(1), ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((seq) => entry(seq))];
    expect(controller.seedCached("s", "source-a", seeded)).toBe(true);
    expect(controller.ledger("s").events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(controller.ledger("s").status).toBe("ready");

    // Cold start then issues a delta from the seeded cursor (10), never a
    // visible cold replay.
    const delta = controller.begin("s", "delta", "source-a", undefined, "initial_navigation");
    expect(effects.reset).not.toHaveBeenCalled();

    // The server replays a window overlapping the seeded tail (8..12); 8, 9,
    // 10 are duplicates the ledger must drop, so only 11 and 12 are new.
    const overlapping = [8, 9, 10, 11, 12].map((seq) => entry(seq));
    controller.handle(deltaFrame(delta.requestId!, overlapping));

    expect(effects.apply).toHaveBeenCalledTimes(1);
    expect(effects.apply).toHaveBeenCalledWith("s", [entry(11), entry(12)]);
    expect(controller.ledger("s").events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("refuses to seed without a user turn in the cached entries", () => {
    const effects = { send: vi.fn(), apply: vi.fn(), replace: vi.fn(), reset: vi.fn(), loading: vi.fn(), reconnect: vi.fn(), publishAsset: vi.fn() };
    const controller = new SessionReplayController(effects);
    expect(controller.seedCached("s", "source-a", [entry(1), entry(2)])).toBe(false);
    expect(controller.ledger("s").events).toEqual([]);
  });
});
