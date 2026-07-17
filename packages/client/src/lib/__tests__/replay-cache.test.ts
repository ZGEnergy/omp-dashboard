import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  createReplayCache,
  REPLAY_CACHE_SCHEMA_VERSION,
  type CachedEvent,
} from "../replay-cache.js";

function evt(seq: number): CachedEvent {
  return {
    seq,
    event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent,
  };
}

describe("replay-cache", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    // Fresh in-memory IndexedDB per test for isolation.
    factory = new IDBFactory();
  });

  it("round-trips put → get for a session", async () => {
    const cache = createReplayCache({ factory });
    await cache.put("sess-a", { maxSeq: 3, payload: [evt(1), evt(2), evt(3)] });
    const hit = await cache.get("sess-a");
    expect(hit).not.toBeNull();
    expect(hit?.maxSeq).toBe(3);
    expect(hit?.payload.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(hit?.schemaVersion).toBe(REPLAY_CACHE_SCHEMA_VERSION);
  });

  it("returns null for an unknown session", async () => {
    const cache = createReplayCache({ factory });
    expect(await cache.get("nope")).toBeNull();
  });

  it("delete removes the entry", async () => {
    const cache = createReplayCache({ factory });
    await cache.put("sess-a", { maxSeq: 1, payload: [evt(1)] });
    await cache.delete("sess-a");
    expect(await cache.get("sess-a")).toBeNull();
  });

  it("treats a schemaVersion mismatch as a miss and drops the entry", async () => {
    // Writer uses an OLD schema version; reader runs the current version.
    const writer = createReplayCache({ factory, schemaVersion: REPLAY_CACHE_SCHEMA_VERSION - 1 });
    await writer.put("sess-a", { maxSeq: 2, payload: [evt(1), evt(2)] });

    const reader = createReplayCache({ factory });
    expect(await reader.get("sess-a")).toBeNull();
    // Entry purged: even a stale-version reader now misses.
    expect(await writer.get("sess-a")).toBeNull();
  });

  it("trims over-budget payload to newest events and persists the tail", async () => {
    // Tiny budget so a handful of events overflow; put must keep newest, not drop.
    const cache = createReplayCache({ factory, maxBytesPerSession: 200 });
    const big = Array.from({ length: 50 }, (_, i) => evt(i + 1));
    await cache.put("huge", { maxSeq: 50, payload: big });
    const hit = await cache.get("huge");
    expect(hit).not.toBeNull();
    expect(hit!.payload.length).toBeGreaterThan(0);
    expect(hit!.payload.length).toBeLessThan(50);
    // Newest seqs only, ascending
    expect(hit!.payload[hit!.payload.length - 1]!.seq).toBe(50);
    expect(hit!.maxSeq).toBe(50);
    for (let i = 1; i < hit!.payload.length; i++) {
      expect(hit!.payload[i]!.seq).toBeGreaterThan(hit!.payload[i - 1]!.seq);
    }
    // Guarantee: persisted array serialization never exceeds the byte budget.
    expect(JSON.stringify(hit!.payload).length).toBeLessThanOrEqual(200);
  });

  it("recheck trims array serialization, not just per-entry byte sum", async () => {
    // selectNewestEventsByBudget sums per-entry JSON.stringify length; the
    // persisted array serialization adds commas + brackets, so a window whose
    // per-entry sum fits the budget can still overflow once array overhead is
    // counted. put() must recheck the full array serialization and drop oldest
    // remaining events until it fits (or the window empties).
    const entryLen = JSON.stringify(evt(1)).length;
    // Budget fits exactly two entries by per-entry sum (2 * entryLen) but the
    // array serialization of two entries (2 * entryLen + comma + brackets) overflows.
    const budget = 2 * entryLen;
    const cache = createReplayCache({ factory, maxBytesPerSession: budget });
    await cache.put("s", { maxSeq: 3, payload: [evt(1), evt(2), evt(3)] });
    const hit = await cache.get("s");
    expect(hit).not.toBeNull();
    // Two entries fit by per-entry sum, but their array serialization overflows,
    // so the recheck drops the oldest leaving exactly the newest event.
    expect(hit!.payload.length).toBe(1);
    expect(hit!.payload[0]!.seq).toBe(3);
    expect(hit!.maxSeq).toBe(3);
    // Guarantee: persisted array serialization never exceeds the byte budget.
    expect(JSON.stringify(hit!.payload).length).toBeLessThanOrEqual(budget);
  });

  it("evicts the least-recently-accessed entry past the cap", async () => {
    const cache = createReplayCache({ factory, maxEntries: 2 });
    await cache.put("a", { maxSeq: 1, payload: [evt(1)] });
    await cache.put("b", { maxSeq: 1, payload: [evt(1)] });
    // Touch "a" so "b" becomes least-recently-accessed.
    await cache.get("a");
    await cache.put("c", { maxSeq: 1, payload: [evt(1)] });

    expect(await cache.get("a")).not.toBeNull();
    expect(await cache.get("c")).not.toBeNull();
    expect(await cache.get("b")).toBeNull();
  });
});
