import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../../../server/src/memory-event-store.js";
import { selectNewestEventsByBudget, selectOlderEventsByBudget, type SeqEvent } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

/**
 * The memory event store's `trim()` deliberately produces a SPARSE retained
 * range: past `DEFAULT_MAX_EVENTS_PER_SESSION` it drops the oldest
 * non-essential events while preserving `message_start`/`message_end` IN PLACE,
 * leaving seq gaps behind.
 *
 * The window selector used to treat any gap as a fatal malformed source and
 * return an empty window — so every session past 20k events hydrated to a blank
 * transcript, with only live-streamed events visible. The two contracts were
 * directly contradictory.
 *
 * The selector now windows over the longest CONTIGUOUS SUFFIX. That keeps the
 * delivered range dense (the client ledger accepts strictly `cursor + 1` and
 * resets on gaps, so a sparse wire model is not an option) while still serving
 * the newest history. See change: fix-sparse-store-empty-hydration.
 */

const BUDGET = 1.5 * 1024 * 1024;

function ev(seq: number, text = "x"): SeqEvent<DashboardEvent> {
  return {
    seq,
    event: {
      eventType: "message_update",
      timestamp: 1_700_000_000_000 + seq,
      data: { message: { role: "assistant", content: [{ type: "text", text }] } },
    } as unknown as DashboardEvent,
  };
}

describe("selectNewestEventsByBudget over a sparse source", () => {
  it("REGRESSION: selects the contiguous suffix instead of returning an empty window", () => {
    // seq 1, then a gap, then a dense run 50..59.
    const source = [ev(1), ...Array.from({ length: 10 }, (_, i) => ev(50 + i))];
    const out = selectNewestEventsByBudget(source, BUDGET);
    expect(out.sourceMalformed).toBeUndefined();
    expect(out.events.map((e) => e.seq)).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it("reports hasMoreOlder when events exist below the gap", () => {
    const source = [ev(1), ...Array.from({ length: 10 }, (_, i) => ev(50 + i))];
    expect(selectNewestEventsByBudget(source, BUDGET).hasMoreOlder).toBe(true);
  });

  it("keeps the delivered window contiguous", () => {
    const source = [ev(1), ev(2), ev(9), ...Array.from({ length: 20 }, (_, i) => ev(40 + i))];
    const seqs = selectNewestEventsByBudget(source, BUDGET).events.map((e) => e.seq);
    expect(seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1)).toBe(true);
  });

  it("is unchanged for an already-dense source", () => {
    const source = Array.from({ length: 20 }, (_, i) => ev(i + 1));
    const out = selectNewestEventsByBudget(source, BUDGET);
    expect(out.events).toHaveLength(20);
    expect(out.hasMoreOlder).toBe(false);
  });

  it("still rejects a genuinely invalid source", () => {
    const bad = [ev(1), { seq: 2, event: null }] as unknown as SeqEvent<DashboardEvent>[];
    expect(selectNewestEventsByBudget(bad, BUDGET).sourceMalformed).toBe(true);
  });

  it("still rejects a descending source", () => {
    expect(selectNewestEventsByBudget([ev(5), ev(3)], BUDGET).sourceMalformed).toBe(true);
  });

  it("still rejects duplicate seqs", () => {
    expect(selectNewestEventsByBudget([ev(5), ev(5)], BUDGET).sourceMalformed).toBe(true);
  });

  it("older paging also survives a sparse source", () => {
    const source = [ev(1), ...Array.from({ length: 20 }, (_, i) => ev(50 + i))];
    const out = selectOlderEventsByBudget(source, 60, BUDGET);
    expect(out.sourceMalformed).toBeUndefined();
    expect(out.events.map((e) => e.seq)).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });
});

describe("end to end against the real store trim", () => {
  it("REGRESSION: a session past the per-session cap still hydrates a non-empty tail", () => {
    const store = createMemoryEventStore(() => false);
    // Interleave the `message_start`/`message_end` events `trim()` preserves in
    // place — this is what makes the retained range sparse.
    for (let i = 0; i < 30_000; i += 1) {
      const eventType =
        i % 100 === 0 ? "message_start" : i % 100 === 50 ? "message_end" : "tool_execution_update";
      store.insertEvent("s", {
        eventType,
        timestamp: 1_700_000_000_000 + i,
        data: { i },
      } as unknown as DashboardEvent);
    }
    const events = store.getEvents("s", 1);
    const hasGap = events.some((e, i) => i > 0 && e.seq !== events[i - 1]!.seq + 1);
    expect(hasGap, "store trim must still produce a sparse range for this test to be meaningful").toBe(true);

    const out = selectNewestEventsByBudget(events, BUDGET, { maxEventBytes: 260_096 });
    expect(out.sourceMalformed).toBeUndefined();
    expect(out.events.length).toBeGreaterThan(0);
    const seqs = out.events.map((e) => e.seq);
    expect(seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1)).toBe(true);
    expect(out.events.at(-1)!.seq).toBe(30_000);
  });
});
