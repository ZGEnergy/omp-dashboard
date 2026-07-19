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
});
