import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../../../server/src/memory-event-store.js";
import { selectNewestEventsByBudget, selectOlderEventsByBudget, type SeqEvent } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

/**
 * Sparse-source handling for the replay window selector.
 *
 * The selector used to treat ANY seq gap as a fatal malformed source and return
 * an empty window. The memory event store's `trim()` used to deliberately
 * produce gaps (preserving `message_start`/`message_end` in place), so every
 * session past `DEFAULT_MAX_EVENTS_PER_SESSION` hydrated to a blank transcript.
 *
 * `trim()` now drops a contiguous prefix (change: fix-fragmenting-event-store-trim),
 * so the live store no longer fragments. The selector still tolerates gaps as
 * defense-in-depth — persisted sessions and pre-existing buffers can present
 * one — by windowing over the longest CONTIGUOUS SUFFIX. The DELIVERED range
 * must stay dense regardless: `SessionReplayLedger` accepts strictly
 * `cursor + 1` and resets on `gap_overflow`.
 * See change: fix-sparse-store-empty-hydration.
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
  it("the store now retains a DENSE range, and it hydrates a large tail", () => {
    // `trim()` drops a contiguous prefix (change: fix-fragmenting-event-store-trim),
    // so the retained buffer no longer fragments. The sparse handling above
    // remains as defense-in-depth for any other source (persisted sessions,
    // legacy buffers) that can still present a gap.
    const store = createMemoryEventStore(() => false);
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
    expect(events.every((e, i) => i === 0 || e.seq === events[i - 1]!.seq + 1)).toBe(true);

    const out = selectNewestEventsByBudget(events, BUDGET, { maxEventBytes: 260_096 });
    expect(out.sourceMalformed).toBeUndefined();
    expect(out.events.length).toBeGreaterThan(1_000);
    expect(out.events.at(-1)!.seq).toBe(30_000);
    const chat = out.events.filter((e) =>
      ["message_start", "message_end"].includes(e.event.eventType),
    ).length;
    expect(chat, "a hydrated window must contain readable chat").toBeGreaterThan(0);
  });
});
