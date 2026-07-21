import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createMemoryEventStore } from "../persistence/memory-event-store.js"

function event(label: string): DashboardEvent {
  return { eventType: "message_end", timestamp: 1, data: { label } };
}

const SERVER_EPOCH = "00000000-0000-4000-8000-000000000000";

describe("memory-event-store generation and retention", () => {
  it("retains a contiguous suffix and reports truncation metadata", () => {
    const store = createMemoryEventStore(() => false, 10, 3);
    for (let i = 0; i < 5; i++) store.insertEvent("s", event(`e${i}`));
    const entries = store.getEvents("s", 1);
    expect(entries.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(entries.map((entry) => entry.event.data.label)).toEqual(["e2", "e3", "e4"]);
    expect(store.getRetainedRange("s")).toEqual({ retainedMinSeq: 3, retainedMaxSeq: 5, historyTruncated: true });
  });

  it("replacing a source assigns fresh contiguous sequence numbers and generation", () => {
    const store = createMemoryEventStore(() => false, 10, 3, 4_000, 20_000, SERVER_EPOCH);
    store.insertEvent("s", event("live"));
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:0`);
    const replaced = store.replaceEvents("s", [event("disk-a"), event("disk-b"), event("disk-c"), event("disk-d"), event("disk-e")]);
    expect(replaced.events.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(replaced.events.map((entry) => entry.event.data.label)).toEqual(["disk-c", "disk-d", "disk-e"]);
    expect(replaced.sourceGeneration).toBe(`${SERVER_EPOCH}:1`);
    expect(store.getSourceGeneration("s")).toBe(replaced.sourceGeneration);
    expect(store.getRetainedRange("s")).toEqual({ retainedMinSeq: 3, retainedMaxSeq: 5, historyTruncated: true });

    // A cursor before the retained suffix is reset to its first retained event;
    // a cursor inside the suffix resumes at that exact sequence.
    expect(store.getEvents("s", 1).map((entry) => entry.event.data.label)).toEqual(["disk-c", "disk-d", "disk-e"]);
    expect(store.getEvents("s", 2).map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(store.getEvents("s", 4).map((entry) => entry.event.data.label)).toEqual(["disk-d", "disk-e"]);
    expect(store.getEvents("s", 6)).toEqual([]);
  });

  it("retains a capped replacement as its contiguous suffix in returned metadata", () => {
    const store = createMemoryEventStore(() => false, 10, 3);
    const replaced = store.replaceEvents("s", [event("one"), event("two"), event("three"), event("four"), event("five")]);
    expect(replaced.events.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(replaced.range).toEqual({ retainedMinSeq: 3, retainedMaxSeq: 5, historyTruncated: true });
    expect(store.getMaxSeq("s")).toBe(5);
    expect(store.insertEvent("s", event("six"))).toBe(6);
  });

  it("never reuses a source generation after an evicted session is recreated", () => {
    const store = createMemoryEventStore(() => false, 1, 10, 4_000, 20_000, SERVER_EPOCH);
    store.insertEvent("s", event("first"));
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:0`);
    store.insertEvent("s", event("second"));
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:0`);
    store.replaceEvents("s", [event("replacement")]);
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:1`);
    store.insertEvent("other", event("evict-s"));
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:2`);
    expect(store.insertEvent("s", event("recreated"))).toBe(1);
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:2`);
    store.insertEvent("s", event("recreated-second"));
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:2`);
    store.replaceEvents("s", [event("replacement-again")]);
    expect(store.getSourceGeneration("s")).toBe(`${SERVER_EPOCH}:3`);
  });

});
