import { describe, expect, it, vi } from "vitest";
import type { DashboardEvent } from "../types.js";

// Count how many times the window selector prepares an event. The mock wraps
// the real implementation (behaviour is unchanged — byte-identity is asserted
// separately), so a bounded call count proves preparation is O(window), not
// O(source): the "prepare the entire source before windowing" amplifier is gone.
const counter = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../prepare-event-for-replay.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prepare-event-for-replay.js")>();
  return {
    ...actual,
    prepareEventForReplay: (...args: Parameters<typeof actual.prepareEventForReplay>) => {
      counter.calls += 1;
      return actual.prepareEventForReplay(...args);
    },
  };
});

const { estimateSeqEventBytes, selectNewestEventsByBudget, selectOlderEventsByBudget } =
  await import("../event-window.js");
type SeqEvent = import("../event-window.js").SeqEvent<DashboardEvent>;

function update(seq: number): SeqEvent {
  return { seq, event: { eventType: "message_update", timestamp: 1, data: { n: seq, pad: "x".repeat(10) } } };
}
function userStart(seq: number): SeqEvent {
  return { seq, event: { eventType: "message_start", timestamp: 1, data: { message: { role: "user", content: `u${seq}` } } } };
}
function serializedEnvelopeTotal(entries: readonly SeqEvent[]): number {
  return entries.reduce(
    (total, entry) => total + new TextEncoder().encode(JSON.stringify(entry)).byteLength,
    0,
  );
}

const SOURCE_LEN = 5000;
const TURN_START_SEQ = 4990; // newest (and only) user-turn boundary near the tail

function buildLargeSource(): SeqEvent[] {
  const source: SeqEvent[] = [];
  for (let seq = 1; seq <= SOURCE_LEN; seq += 1) {
    source.push(seq === TURN_START_SEQ ? userStart(seq) : update(seq));
  }
  return source;
}

describe("event-window bounded preparation", () => {
  it("prepares only the selected suffix for a cold tail, not the whole source", () => {
    const source = buildLargeSource();
    // Budget fits exactly the newest complete turn [4990..5000], nothing older.
    const newestTurn = source.slice(TURN_START_SEQ - 1);
    const budget = serializedEnvelopeTotal(newestTurn) + 10;

    counter.calls = 0;
    const result = selectNewestEventsByBudget(source, budget);

    // Byte-identity of the delivered window (per-event prepare is independent).
    const expectedSeqs = Array.from({ length: SOURCE_LEN - TURN_START_SEQ + 1 }, (_, i) => TURN_START_SEQ + i);
    expect(result.events.map((e) => e.seq)).toEqual(expectedSeqs);
    expect(result.hasMoreOlder).toBe(true);
    expect(result.partialHead).toBe(false);
    expect(result.windowMinSeq).toBe(TURN_START_SEQ);
    expect(result.windowMaxSeq).toBe(SOURCE_LEN);
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.bytes).toBe(serializedEnvelopeTotal(result.events));

    // O(window): a small constant multiple of the returned window, far below
    // the 5000-event source. The old code prepared every event (~5000 calls).
    expect(counter.calls).toBeLessThanOrEqual(result.events.length * 2 + 4);
    expect(counter.calls).toBeLessThan(SOURCE_LEN / 10);
  });

  it("prepares only the selected suffix for an older page, not the whole source", () => {
    const source = buildLargeSource();
    // Older page strictly below the turn start: a userless run [1..4989].
    const oneSize = estimateSeqEventBytes(update(4989));
    const budget = oneSize * 4 + 10;

    counter.calls = 0;
    const result = selectOlderEventsByBudget(source, TURN_START_SEQ, budget);

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.windowMaxSeq).toBe(TURN_START_SEQ - 1);
    expect(result.hasMoreOlder).toBe(true);
    expect(result.partialHead).toBe(false);
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(result.bytes).toBe(serializedEnvelopeTotal(result.events));
    // Contiguous newest-of-older run.
    expect(result.events.map((e) => e.seq)).toEqual(
      Array.from({ length: result.events.length }, (_, i) => result.windowMinSeq! + i),
    );

    expect(counter.calls).toBeLessThanOrEqual(result.events.length * 2 + 4);
    expect(counter.calls).toBeLessThan(SOURCE_LEN / 10);
  });
});
