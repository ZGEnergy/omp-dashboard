import { isCoverageContiguous } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { SessionReplayLedger } from "../session-replay-ledger.js";

const event = (seq: number) => ({
  seq,
  event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent,
});

const cold = (events = [event(10), event(11)]) => ({
  type: "event_replay" as const,
  sessionId: "s",
  requestId: "cold-1",
  sourceGeneration: "source-a",
  replayKind: "cold" as const,
  events,
  isLast: false,
  windowMinSeq: events[0]?.seq ?? null,
  windowMaxSeq: events.at(-1)?.seq ?? null,
  retainedMinSeq: 1,
  hasMoreOlder: true,
  partialHead: false,
  historyTruncated: false,
});

describe("SessionReplayLedger", () => {
  it("establishes a cold baseline, admits only contiguous deltas, and treats identical duplicates as inert", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "" });
    expect(ledger.admit(cold()).accepted.map((entry) => entry.seq)).toEqual([10, 11]);
    expect(ledger.cursor).toBe(11);
    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admit({ ...cold([event(11), event(12)]), requestId: "delta-1", replayKind: "delta" }).accepted.map((entry) => entry.seq)).toEqual([12]);
    expect(ledger.cursor).toBe(12);
    expect(ledger.admit({ ...cold([event(12)]), requestId: "delta-1", replayKind: "delta", isLast: true }).accepted).toEqual([]);
    expect(ledger.status).toBe("ready");
  });

  it("advances cold and delta cursors across explicit skipped raw ranges", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    const coldResult = ledger.admit({
      ...cold([event(1)]),
      events: [event(1)],
      skippedSeqRanges: [{ fromSeq: 2, toSeq: 50 }],
      windowMinSeq: 1,
      windowMaxSeq: 50,
      isLast: true,
    });

    expect(coldResult.reset).toBeNull();
    expect(ledger.events.map((entry) => entry.seq)).toEqual([1]);
    expect(ledger.minSeq).toBe(1);
    expect(ledger.cursor).toBe(50);

    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    const deltaResult = ledger.admit({
      ...cold([event(101)]),
      requestId: "delta-1",
      replayKind: "delta",
      skippedSeqRanges: [{ fromSeq: 51, toSeq: 100 }],
      windowMinSeq: 51,
      windowMaxSeq: 101,
      isLast: true,
    });

    expect(deltaResult.reset).toBeNull();
    expect(deltaResult.accepted.map((entry) => entry.seq)).toEqual([101]);
    expect(ledger.cursor).toBe(101);
    expect(ledger.admitLive(event(102)).accepted.map((entry) => entry.seq)).toEqual([102]);
  });

  it("accepts an older page ending inside a coalesced run", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit({
      ...cold([event(101)]),
      events: [event(101)],
      skippedSeqRanges: [{ fromSeq: 50, toSeq: 100 }],
      windowMinSeq: 50,
      windowMaxSeq: 101,
      isLast: true,
    });
    expect(ledger.minSeq).toBe(50);

    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 50 });
    const olderResult = ledger.admit({
      ...cold([event(1)]),
      requestId: "older-1",
      replayKind: "older",
      skippedSeqRanges: [{ fromSeq: 2, toSeq: 49 }],
      windowMinSeq: 1,
      windowMaxSeq: 49,
      isLast: true,
    });

    expect(olderResult.reset).toBeNull();
    expect(olderResult.rebuild).toBe(true);
    expect(ledger.events.map((entry) => entry.seq)).toEqual([1, 101]);
    expect(ledger.minSeq).toBe(1);
    expect(ledger.cursor).toBe(101);
  });

  it("admits a range-only cold frame and range-only older page", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    const coldResult = ledger.admit({
      ...cold([]),
      events: [],
      skippedSeqRanges: [{ fromSeq: 10, toSeq: 20 }],
      isLast: true,
    });
    expect(coldResult.reset).toBeNull();
    expect(coldResult.accepted).toEqual([]);
    expect(ledger.minSeq).toBe(10);
    expect(ledger.cursor).toBe(20);
    expect(ledger.status).toBe("ready");

    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 10 });
    const olderResult = ledger.admit({
      ...cold([]),
      requestId: "older-1",
      replayKind: "older",
      events: [],
      skippedSeqRanges: [{ fromSeq: 1, toSeq: 9 }],
      isLast: true,
    });
    expect(olderResult.reset).toBeNull();
    expect(olderResult.accepted).toEqual([]);
    expect(ledger.minSeq).toBe(1);
    expect(ledger.cursor).toBe(20);
  });

  it("seeds a range-only cached baseline and resets on event/range overlap", () => {
    const ledger = new SessionReplayLedger("s");
    expect(ledger.seed("source-a", [], [{ fromSeq: 1, toSeq: 50 }])).toBe(true);
    expect(ledger.minSeq).toBe(1);
    expect(ledger.cursor).toBe(50);
    expect(ledger.status).toBe("ready");

    ledger.begin({ requestId: "cold-2", kind: "cold", sourceGeneration: "source-b" });
    const overlapResult = ledger.admit({
      ...cold([event(5)]),
      requestId: "cold-2",
      sourceGeneration: "source-b",
      skippedSeqRanges: [{ fromSeq: 1, toSeq: 10 }],
    });
    expect(overlapResult.reset).toBe("invalid_replay");
  });

  it("seeds a valid contiguous suffix as the ready canonical baseline", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "stale-request", kind: "delta", sourceGeneration: "source-old" });

    expect(ledger.seed("source-a", [event(10), event(11)])).toBe(true);
    expect(ledger.sourceGeneration).toBe("source-a");
    expect(ledger.events.map((entry) => entry.seq)).toEqual([10, 11]);
    expect(ledger.minSeq).toBe(10);
    expect(ledger.cursor).toBe(11);
    expect(ledger.status).toBe("ready");
    expect(ledger.request).toBeNull();
  });

  it("rejects a noncontiguous seed without mutating canonical or request state", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.seed("source-a", [event(10), event(11)]);
    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admitLive(event(13)).repair).toEqual({ kind: "delta", cursor: 11 });
    const request = ledger.request;

    expect(ledger.seed("source-b", [])).toBe(false);
    expect(ledger.seed("source-b", [event(20), event(22)])).toBe(false);
    expect(ledger.sourceGeneration).toBe("source-a");
    expect(ledger.events.map((entry) => entry.seq)).toEqual([10, 11]);
    expect(ledger.minSeq).toBe(10);
    expect(ledger.cursor).toBe(11);
    expect(ledger.request).toEqual(request);
    expect(ledger.admit({ ...cold([event(12)]), requestId: "delta-1", replayKind: "delta" }).accepted.map((entry) => entry.seq)).toEqual([12, 13]);
  });

  it("replaces source state and clears gaps, completion, and active authority", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.seed("source-a", [event(10), event(11)]);
    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admitLive(event(13)).repair).toEqual({ kind: "delta", cursor: 11 });
    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 10, anchorToken: "anchor" });
    expect(ledger.admit({ ...cold([event(8), event(9)]), requestId: "older-1", replayKind: "older", isLast: true }).rebuild).toBe(true);

    expect(ledger.seed("source-b", [event(20), event(21)])).toBe(true);
    expect(ledger.sourceGeneration).toBe("source-b");
    expect(ledger.events.map((entry) => entry.seq)).toEqual([20, 21]);
    expect(ledger.minSeq).toBe(20);
    expect(ledger.cursor).toBe(21);
    expect(ledger.status).toBe("ready");
    expect(ledger.request).toBeNull();
    expect(ledger.takeOlderCompletion()).toBeNull();
    expect(ledger.admitLive(event(23)).repair).toEqual({ kind: "delta", cursor: 21 });
  });


  it("rejects a noncontiguous cold baseline and clears the provisional prefix", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    expect(ledger.admit(cold([event(10), event(12)])).reset).toBe("invalid_replay");
    expect(ledger.events).toEqual([]);
  });

  it("reconciles a buffered gap with an identical delta and rejects a conflicting duplicate", () => {
    const ledger = new SessionReplayLedger("s", { maxGapBytes: JSON.stringify(event(13)).length });
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    expect(ledger.admitLive(event(13)).repair).not.toBeNull();
    const duplicateBuffered = ledger.admitLive(event(13));
    expect(duplicateBuffered.reset).toBeNull();
    expect(duplicateBuffered.accepted).toEqual([]);
    expect(duplicateBuffered.repair).toBeNull();
    expect(ledger.cursor).toBe(11);
    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admit({ ...cold([event(12), event(13)]), requestId: "delta-1", replayKind: "delta", isLast: true }).accepted.map((entry) => entry.seq)).toEqual([12, 13]);
    expect(ledger.cursor).toBe(13);

    ledger.begin({ requestId: "delta-2", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admitLive(event(15)).repair).not.toBeNull();
    const conflict = { ...event(15), event: { ...event(15).event, data: { changed: true } } };
    expect(ledger.admit({ ...cold([conflict]), requestId: "delta-2", replayKind: "delta" }).reset).toBe("conflict");
    expect(ledger.events).toEqual([]);
  });

  it("buffers a live gap without advancing and requests one delta repair", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    const gap = ledger.admitLive(event(13));
    expect(gap.accepted).toEqual([]);
    expect(gap.repair).toEqual({ kind: "delta", cursor: 11 });
    expect(ledger.cursor).toBe(11);
    ledger.begin({ requestId: "repair-1", kind: "delta", sourceGeneration: "source-a" });
    expect(ledger.admit({ ...cold([event(12)]), requestId: "repair-1", replayKind: "delta" }).accepted.map((entry) => entry.seq)).toEqual([12, 13]);
    expect(ledger.cursor).toBe(13);
  });

  it("rejects conflicts and bounded gap overflow, then requires cold recovery", () => {
    const ledger = new SessionReplayLedger("s", { maxGapEvents: 1, maxGapBytes: 1024 });
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    expect(ledger.admitLive(event(13)).repair).not.toBeNull();
    expect(ledger.admitLive(event(15)).reset).toBe("gap_overflow");
    // A protocol reset invalidates the entire canonical prefix; it cannot be
    // used as the base for a later repair frame.
    expect(ledger.cursor).toBe(0);
    expect(ledger.events).toEqual([]);
    expect(ledger.status).toBe("cold");
    ledger.begin({ requestId: "cold-2", kind: "cold", sourceGeneration: "source-a" });
    expect(ledger.admit({ ...cold([event(20), event(21)]), requestId: "cold-2" }).accepted.map((entry) => entry.seq)).toEqual([20, 21]);
    expect(ledger.cursor).toBe(21);
    expect(ledger.admitLive({ ...event(21), event: { ...event(21).event, data: { changed: true } } }).reset).toBe("conflict");
  });

  it("requires older pages to terminate exactly at current low watermark minus one", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 10, anchorToken: "anchor" });
    expect(ledger.admit({ ...cold([event(8), event(9)]), requestId: "older-1", replayKind: "older", isLast: true }).reset).toBeNull();
    expect(ledger.events.map((entry) => entry.seq)).toEqual([8, 9, 10, 11]);
    expect(ledger.takeOlderCompletion()).toEqual({ requestId: "older-1", anchorToken: "anchor" });
  });

  it("admits an ascending older page split across replay frames", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 10, anchorToken: "anchor" });

    expect(ledger.admit({ ...cold([event(6), event(7)]), requestId: "older-1", replayKind: "older" }).reset).toBeNull();
    const terminal = ledger.admit({ ...cold([event(8), event(9)]), requestId: "older-1", replayKind: "older", isLast: true });

    expect(terminal.reset).toBeNull();
    expect(terminal.rebuild).toBe(true);
    expect(ledger.events.map((entry) => entry.seq)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(ledger.takeOlderCompletion()).toEqual({ requestId: "older-1", anchorToken: "anchor" });
  });

  it("makes reset and source changes dominate all stale frames", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold());
    ledger.reset("source-b");
    expect(ledger.admit(cold()).stale).toBe(true);
    expect(ledger.events).toEqual([]);
  });

  it("keeps only the newest contiguous tail within the retained-byte budget", () => {
    const budget = JSON.stringify(event(1)).length * 2;
    const ledger = new SessionReplayLedger("s", { maxRetainedBytes: budget } as never);
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold([event(1), event(2)]));

    const result = ledger.admitLive(event(3));

    expect(result.evictedHead).toBe(true);
    expect(ledger.events.map((entry) => entry.seq)).toEqual([2, 3]);
    expect(ledger.minSeq).toBe(2);
    expect(ledger.cursor).toBe(3);
  });

  it("setMaxRetainedBytes lifts the cap without pruning and lowering flushes to the new budget", () => {
    const ledger = new SessionReplayLedger("s"); // default cap fits all
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold([event(10), event(11), event(12), event(13)]));
    expect(ledger.events.map((entry) => entry.seq)).toEqual([10, 11, 12, 13]);

    // Lifting the cap (reading older history) never prunes.
    expect(ledger.setMaxRetainedBytes(Number.POSITIVE_INFINITY)).toBe(false);
    expect(ledger.events.map((entry) => entry.seq)).toEqual([10, 11, 12, 13]);

    // Lowering (returning to the live tail) flushes the oldest, keeps the newest
    // contiguous tail, and reports the head eviction so the reducer can prune.
    expect(ledger.setMaxRetainedBytes(1)).toBe(true);
    expect(ledger.events.map((entry) => entry.seq)).toEqual([13]);
    expect(ledger.minSeq).toBe(13);
    expect(ledger.cursor).toBe(13);
  });
  it("retains skipped ranges owned by surviving representative during head eviction", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit({
      ...cold([event(1), event(4)]),
      events: [event(1), event(4)],
      skippedSeqRanges: [{ fromSeq: 2, toSeq: 3 }],
      isLast: true,
    });
    expect(ledger.events.map((e) => e.seq)).toEqual([1, 4]);
    expect(ledger.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 3 }]);
    expect(ledger.minSeq).toBe(1);

    const singleEventBytes = JSON.stringify(event(4)).length;
    expect(ledger.setMaxRetainedBytes(singleEventBytes)).toBe(true);

    expect(ledger.events.map((e) => e.seq)).toEqual([4]);
    expect(ledger.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 3 }]);
    expect(ledger.minSeq).toBe(2);
    expect(ledger.cursor).toBe(4);
  });
  it("accounts for skipped range metadata in retained byte count and keeps logical suffix contiguous when pruning disjoint ranges", () => {
    const maxCap = 1000;
    const ledger = new SessionReplayLedger("s", { maxRetainedBytes: maxCap } as never);
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });

    const events = [];
    const skippedSeqRanges = [];
    let cursor = 0;
    for (let i = 1; i <= 30; i++) {
      const exactSeq = i * 10;
      events.push(event(exactSeq));
      if (exactSeq > cursor + 1) {
        skippedSeqRanges.push({ fromSeq: cursor + 1, toSeq: exactSeq - 1 });
      }
      cursor = exactSeq;
    }

    const outcome = ledger.admit({
      type: "event_replay",
      sessionId: "s",
      requestId: "cold-1",
      sourceGeneration: "source-a",
      replayKind: "cold",
      events,
      skippedSeqRanges,
      isLast: true,
      windowMinSeq: 1,
      windowMaxSeq: cursor,
      retainedMinSeq: 1,
      hasMoreOlder: false,
      partialHead: false,
      historyTruncated: false,
    });

    expect(outcome.reset).toBeNull();
    expect(outcome.evictedHead).toBe(true);
    expect(ledger.retainedByteCount).toBeLessThanOrEqual(maxCap);
    expect(isCoverageContiguous(ledger.events, ledger.skippedSeqRanges, ledger.minSeq, ledger.cursor)).toBe(true);
  });
  it("admits a valid delta from cursor 10 containing exact 11 and 21 plus skipped 12..20", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit(cold([event(10)]));
    expect(ledger.cursor).toBe(10);

    ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });
    const result = ledger.admit({
      ...cold([event(11), event(21)]),
      requestId: "delta-1",
      replayKind: "delta",
      events: [event(11), event(21)],
      skippedSeqRanges: [{ fromSeq: 12, toSeq: 20 }],
      windowMinSeq: 11,
      windowMaxSeq: 21,
      isLast: true,
    });

    expect(result.reset).toBeNull();
    expect(result.accepted.map((e) => e.seq)).toEqual([11, 21]);
    expect(ledger.cursor).toBe(21);
    expect(ledger.events.map((e) => e.seq)).toEqual([10, 11, 21]);
  });

  it("admits a multi-frame cold baseline crossing exact and skipped range boundaries in order", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });

    const f1 = ledger.admit({
      ...cold([event(10)]),
      events: [event(10)],
      skippedSeqRanges: [{ fromSeq: 11, toSeq: 15 }],
      windowMinSeq: 10,
      windowMaxSeq: 15,
      isLast: false,
    });
    expect(f1.reset).toBeNull();
    expect(f1.accepted.map((e) => e.seq)).toEqual([10]);
    expect(ledger.cursor).toBe(15);

    const f2 = ledger.admit({
      ...cold([event(16), event(21)]),
      requestId: "cold-1",
      replayKind: "cold",
      events: [event(16), event(21)],
      skippedSeqRanges: [{ fromSeq: 17, toSeq: 20 }],
      windowMinSeq: 16,
      windowMaxSeq: 21,
      isLast: true,
    });

    expect(f2.reset).toBeNull();
    expect(f2.accepted.map((e) => e.seq)).toEqual([16, 21]);
    expect(ledger.cursor).toBe(21);
    expect(ledger.events.map((e) => e.seq)).toEqual([10, 16, 21]);
  });

  it("validates an older-page huge skipped range in O(retained) time without iterating omitted sequences", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    ledger.admit({
      ...cold([event(1_000_000)]),
      events: [event(1_000_000)],
      windowMinSeq: 1_000_000,
      windowMaxSeq: 1_000_000,
      isLast: true,
    });
    expect(ledger.minSeq).toBe(1_000_000);

    ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 1_000_000 });

    const bySeq = (ledger as unknown as { bySeq: Map<number, unknown> }).bySeq;
    const originalHas = bySeq.has;
    let hasCalls = 0;
    bySeq.has = function (key: number) {
      hasCalls++;
      return originalHas.call(this, key);
    };

    try {
      const result = ledger.admit({
        ...cold([]),
        requestId: "older-1",
        replayKind: "older",
        events: [],
        skippedSeqRanges: [{ fromSeq: 1, toSeq: 999_999 }],
        windowMinSeq: 1,
        windowMaxSeq: 999_999,
        isLast: true,
      });

      expect(result.reset).toBeNull();
      expect(ledger.minSeq).toBe(1);
      expect(ledger.cursor).toBe(1_000_000);
      expect(hasCalls).toBeLessThan(100);
    } finally {
      bySeq.has = originalHas;
    }
  });

  it("rejects skipped ranges covering retained or buffered exact sequences using interval comparison without per-seq scans", () => {
    // 1. Older page skipped range overlaps retained event in bySeq
    {
      const ledger = new SessionReplayLedger("s");
      ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
      ledger.admit({
        ...cold([event(50), event(100)]),
        events: [event(50), event(100)],
        skippedSeqRanges: [{ fromSeq: 51, toSeq: 99 }],
        windowMinSeq: 50,
        windowMaxSeq: 100,
        isLast: true,
      });
      expect(ledger.minSeq).toBe(50);

      ledger.begin({ requestId: "older-1", kind: "older", sourceGeneration: "source-a", fromSeq: 50 });

      const bySeq = (ledger as unknown as { bySeq: Map<number, unknown> }).bySeq;
      const originalHas = bySeq.has;
      let hasCalls = 0;
      bySeq.has = function (key: number) {
        hasCalls++;
        return originalHas.call(this, key);
      };

      try {
        const result = ledger.admit({
          ...cold([]),
          requestId: "older-1",
          replayKind: "older",
          events: [],
          skippedSeqRanges: [{ fromSeq: 1, toSeq: 49 }, { fromSeq: 40, toSeq: 60 }],
          windowMinSeq: 1,
          windowMaxSeq: 60,
          isLast: true,
        });

        expect(result.stale).toBe(true);
        expect(ledger.minSeq).toBe(50);
        expect(hasCalls).toBeLessThan(100);
      } finally {
        bySeq.has = originalHas;
      }
    }

    // 2. Forward delta skipped range overlaps retained event in bySeq
    {
      const ledger = new SessionReplayLedger("s");
      ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
      ledger.admit({
        ...cold([event(10), event(15)]),
        events: [event(10), event(15)],
        skippedSeqRanges: [{ fromSeq: 11, toSeq: 14 }],
        windowMinSeq: 10,
        windowMaxSeq: 15,
        isLast: true,
      });
      expect(ledger.cursor).toBe(15);

      ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });

      const bySeq = (ledger as unknown as { bySeq: Map<number, unknown> }).bySeq;
      const originalHas = bySeq.has;
      let hasCalls = 0;
      bySeq.has = function (key: number) {
        hasCalls++;
        return originalHas.call(this, key);
      };

      try {
        const result = ledger.admit({
          ...cold([event(21)]),
          requestId: "delta-1",
          replayKind: "delta",
          events: [event(21)],
          skippedSeqRanges: [{ fromSeq: 12, toSeq: 20 }],
          windowMinSeq: 12,
          windowMaxSeq: 21,
          isLast: true,
        });

        expect(result.stale).toBe(true);
        expect(ledger.cursor).toBe(15);
        expect(hasCalls).toBeLessThan(100);
      } finally {
        bySeq.has = originalHas;
      }
    }

    // 3. Forward delta skipped range consumes buffered live gap event in gaps
    {
      const ledger = new SessionReplayLedger("s");
      ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
      ledger.admit(cold([event(10)]));

      expect(ledger.admitLive(event(15)).repair).not.toBeNull();

      ledger.begin({ requestId: "delta-1", kind: "delta", sourceGeneration: "source-a" });

      const gaps = (ledger as unknown as { gaps: Map<number, unknown> }).gaps;
      const originalGapsHas = gaps.has;
      let gapsHasCalls = 0;
      gaps.has = function (key: number) {
        gapsHasCalls++;
        return originalGapsHas.call(this, key);
      };

      try {
        const result = ledger.admit({
          ...cold([event(21)]),
          requestId: "delta-1",
          replayKind: "delta",
          events: [event(21)],
          skippedSeqRanges: [{ fromSeq: 11, toSeq: 20 }],
          windowMinSeq: 11,
          windowMaxSeq: 21,
          isLast: true,
        });

        expect(result.reset).toBeNull();
        expect(result.accepted.map((e) => e.seq)).toEqual([21]);
        expect(ledger.cursor).toBe(21);
        expect(gaps.size).toBe(0);
        expect(gapsHasCalls).toBeLessThan(100);
      } finally {
        gaps.has = originalGapsHas;
      }
    }
  });
  it("rejects a cold baseline frame with sorted exact events having a gap greater than one", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    const result = ledger.admit(cold([event(10), event(13)]));
    expect(result.reset).toBe("invalid_replay");
    expect(ledger.events).toEqual([]);
    expect(ledger.cursor).toBe(0);
  });

  it("rejects a cold baseline frame with exact events and SkippedSeqRange leaving an uncovered span", () => {
    const ledger = new SessionReplayLedger("s");
    ledger.begin({ requestId: "cold-1", kind: "cold", sourceGeneration: "source-a" });
    const frame = {
      ...cold([event(10), event(15)]),
      skippedSeqRanges: [{ fromSeq: 11, toSeq: 13 }],
    };
    const result = ledger.admit(frame as never);
    expect(result.reset).toBe("invalid_replay");
    expect(ledger.events).toEqual([]);
    expect(ledger.cursor).toBe(0);
  });
});
