import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { selectNewestEventsByBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../memory-event-store.js";

/**
 * `trim()` used to preserve `message_start` / `message_end` in place while
 * dropping the non-essential events between them (change:
 * preserve-chat-head-on-event-trim). The intent was to keep the transcript head
 * during a subagent flood, and it deliberately left seq gaps behind.
 *
 * Measured against a real long-running session's event mix (~20% essential),
 * that degenerates without bound: every trim strands more essentials and drops
 * everything between them, so the buffer converges on ~20k ISOLATED events with
 * a gap between nearly every pair.
 *
 *   inserted   retained   gaps     longest contiguous tail
 *     30,000     20,234    2,464            17,770
 *     60,000     20,165   10,048            10,117
 *    120,000     20,027   20,000                27
 *    231,000     20,003   19,999                 4
 *
 * Delivery cannot use a sparse range: `SessionReplayLedger` accepts strictly
 * `cursor + 1` and resets on `gap_overflow`, so a window must be dense. A
 * 4-event dense tail renders an empty transcript — the preserved chat head is
 * unreachable in practice, which defeats the very purpose of preserving it.
 *
 * The buffer is now trimmed as a contiguous prefix, so the whole retained range
 * stays dense and deliverable. See change: fix-fragmenting-event-store-trim.
 */

const neverPinned = () => false;

function ev(eventType: string): DashboardEvent {
  return { eventType, timestamp: 1, data: { pad: "x" } } as unknown as DashboardEvent;
}

describe("memory event store trims a contiguous prefix", () => {
  it("REGRESSION: drops the oldest events without stranding essentials", () => {
    const store = createMemoryEventStore(neverPinned, 100, 3);
    store.insertEvent("s1", ev("message_start"));
    store.insertEvent("s1", ev("message_end"));
    store.insertEvent("s1", ev("tool_execution_start"));
    store.insertEvent("s1", ev("subagent_started"));

    const events = store.getEvents("s1", 1);
    expect(events.map((e) => e.seq)).toEqual([2, 3, 4]);
  });

  it("keeps the retained range dense no matter the event mix", () => {
    const store = createMemoryEventStore(neverPinned, 100, 50);
    for (let i = 0; i < 5_000; i += 1) {
      store.insertEvent("s1", ev(i % 5 === 0 ? "message_start" : i % 5 === 1 ? "message_end" : "tool_execution_update"));
    }
    const events = store.getEvents("s1", 1);
    expect(events.every((e, i) => i === 0 || e.seq === events[i - 1]!.seq + 1)).toBe(true);
  });

  it("REGRESSION: a very long session still hydrates a large dense tail", () => {
    // The shape that collapsed to a 4-event tail before this change.
    const store = createMemoryEventStore(neverPinned);
    for (let i = 0; i < 120_000; i += 1) {
      const t = i % 5 === 0 ? "message_start" : i % 5 === 1 ? "message_end" : "tool_execution_update";
      store.insertEvent("s1", ev(t));
    }
    const events = store.getEvents("s1", 1);
    let longestGapFree = 1;
    let run = 1;
    for (let i = 1; i < events.length; i += 1) {
      run = events[i]!.seq === events[i - 1]!.seq + 1 ? run + 1 : 1;
      longestGapFree = Math.max(longestGapFree, run);
    }
    expect(longestGapFree).toBe(events.length);
    expect(events.length).toBeGreaterThan(10_000);

    const window = selectNewestEventsByBudget(events, 1.5 * 1024 * 1024, { maxEventBytes: 260_096 });
    expect(window.sourceMalformed).toBeUndefined();
    expect(window.events.length).toBeGreaterThan(1_000);
    const chat = window.events.filter((e) =>
      ["message_start", "message_end"].includes(e.event.eventType),
    ).length;
    expect(chat, "a hydrated window must contain readable chat").toBeGreaterThan(0);
  });

  it("still reports historyTruncated once trimming has happened", () => {
    const store = createMemoryEventStore(neverPinned, 100, 3);
    for (let i = 0; i < 10; i += 1) store.insertEvent("s1", ev("tool_execution_update"));
    expect(store.getRetainedRange("s1").historyTruncated).toBe(true);
  });
});
