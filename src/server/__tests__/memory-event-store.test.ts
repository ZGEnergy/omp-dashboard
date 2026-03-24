import { describe, it, expect } from "vitest";
import { createMemoryEventStore } from "../memory-event-store.js";
import type { DashboardEvent } from "../../shared/types.js";

function makeEvent(type: string = "test"): DashboardEvent {
  return { eventType: type, timestamp: Date.now(), data: {} };
}

describe("memory-event-store", () => {
  const neverPinned = () => false;

  it("inserts and retrieves events", () => {
    const store = createMemoryEventStore(neverPinned);
    const seq1 = store.insertEvent("s1", makeEvent("a"));
    const seq2 = store.insertEvent("s1", makeEvent("b"));
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);

    const events = store.getEvents("s1", 1);
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
  });

  it("getEvents with minSeq filters correctly", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());

    const events = store.getEvents("s1", 2);
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(2);
  });

  it("getEvents returns empty for unknown session", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.getEvents("unknown", 1)).toEqual([]);
  });

  it("getEvent retrieves single event", () => {
    const store = createMemoryEventStore(neverPinned);
    const evt = makeEvent("special");
    store.insertEvent("s1", evt);
    const result = store.getEvent("s1", 1);
    expect(result?.eventType).toBe("special");
  });

  it("getEvent returns undefined for missing", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.getEvent("s1", 1)).toBeUndefined();
  });

  it("deleteEventsForSession clears buffer", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    const deleted = store.deleteEventsForSession("s1");
    expect(deleted).toBe(2);
    expect(store.getEvents("s1", 1)).toEqual([]);
    expect(store.hasEvents("s1")).toBe(false);
  });

  it("deleteEventsForSession returns 0 for unknown session", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.deleteEventsForSession("unknown")).toBe(0);
  });

  it("hasEvents checks correctly", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.hasEvents("s1")).toBe(false);
    store.insertEvent("s1", makeEvent());
    expect(store.hasEvents("s1")).toBe(true);
  });

  it("sessionCount tracks number of sessions", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.sessionCount()).toBe(0);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s2", makeEvent());
    expect(store.sessionCount()).toBe(2);
  });

  it("assigns new seq numbers after deleteEventsForSession", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    store.deleteEventsForSession("s1");
    const seq = store.insertEvent("s1", makeEvent());
    expect(seq).toBe(1); // Resets after delete
  });

  describe("LRU eviction", () => {
    it("evicts least-recently-accessed when over limit", () => {
      const store = createMemoryEventStore(neverPinned, 3);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());
      expect(store.sessionCount()).toBe(3);

      // s4 should cause eviction of s1 (oldest)
      store.insertEvent("s4", makeEvent());
      expect(store.sessionCount()).toBe(3);
      expect(store.hasEvents("s1")).toBe(false);
      expect(store.hasEvents("s4")).toBe(true);
    });

    it("skips pinned sessions during eviction", () => {
      const pinned = new Set(["s1"]);
      const store = createMemoryEventStore((id) => pinned.has(id), 3);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());

      // s4 should cause eviction of s2 (s1 is pinned)
      store.insertEvent("s4", makeEvent());
      expect(store.hasEvents("s1")).toBe(true); // pinned, not evicted
      expect(store.hasEvents("s2")).toBe(false); // evicted
    });

    it("does not evict when all sessions are pinned", () => {
      const store = createMemoryEventStore(() => true, 2);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());
      // All pinned — can't evict, so size exceeds limit
      expect(store.sessionCount()).toBe(3);
    });

    it("accessing events updates lastAccess to prevent eviction", async () => {
      const store = createMemoryEventStore(neverPinned, 3);
      store.insertEvent("s1", makeEvent());
      await new Promise((r) => setTimeout(r, 5));
      store.insertEvent("s2", makeEvent());
      await new Promise((r) => setTimeout(r, 5));
      store.insertEvent("s3", makeEvent());

      // Access s1 so it becomes most recent
      await new Promise((r) => setTimeout(r, 5));
      store.getEvents("s1", 1);

      // s4 should evict s2 (least recently accessed), not s1
      store.insertEvent("s4", makeEvent());
      expect(store.hasEvents("s1")).toBe(true);
      expect(store.hasEvents("s2")).toBe(false);
    });
  });
});
