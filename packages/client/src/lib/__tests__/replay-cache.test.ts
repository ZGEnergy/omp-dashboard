import {
  DEFAULT_MAX_REPLAY_TEXT_BYTES,
  REPLAY_BYTE_TRUNCATION_MARKER,
} from "@blackbelt-technology/pi-dashboard-shared/prepare-event-for-replay.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CachedEvent,
  createReplayCache,
  REPLAY_CACHE_SCHEMA_VERSION,
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
    // The final retained suffix is contiguous, ends at the newest event, and
    // satisfies the actual serialized-byte cap (which is the durable contract).
    expect(hit!.payload.length).toBeGreaterThan(0);
    expect(hit!.payload.at(-1)!.seq).toBe(3);
    expect(hit!.maxSeq).toBe(3);
    // Guarantee: persisted array serialization never exceeds the byte budget.
    expect(JSON.stringify(hit!.payload).length).toBeLessThanOrEqual(budget);
  });

  it("retains a session cache payload up to the 10 MiB default cap", async () => {
    const cache = createReplayCache({ factory });
    const fiveMiB = "x".repeat(5 * 1024 * 1024);
    const payload: CachedEvent[] = [{
      seq: 1,
      event: {
        sessionId: "s",
        eventType: "tool_execution_end",
        timestamp: 1,
        data: { toolCallId: "tc1", result: fiveMiB },
      } as unknown as DashboardEvent,
    }];

    await cache.put("large-session", { maxSeq: 1, payload });

    expect(await cache.get("large-session")).not.toBeNull();
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

// Phase 6 hardening: server-scoped keying, generation-fenced stale put/drop
// dominance, and prepared-suffix + window-metadata storage. See change:
// mobile-session-rehydration.
describe("replay-cache — scoped + generation fence", () => {
  let factory: IDBFactory;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  function evt(seq: number): CachedEvent {
    return {
      seq,
      event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent,
    };
  }

  function toolEnd(seq: number, result: string): CachedEvent {
    return {
      seq,
      event: {
        sessionId: "s",
        eventType: "tool_execution_end",
        timestamp: seq,
        data: { toolCallId: "tc1", result },
      } as unknown as DashboardEvent,
    };
  }

  it("scopes reads by opaque server epoch/source generation; cross-source and legacy entries miss", async () => {
    const cache = createReplayCache({ factory });
    const scopeA = { serverEpoch: "server-1", sourceGeneration: "source-a" };
    const scopeB = { serverEpoch: "server-2", sourceGeneration: "source-a" };
    const scopeC = { serverEpoch: "server-1", sourceGeneration: "source-b" };

    await cache.putScoped(scopeA, "s1", { maxSeq: 2, payload: [evt(1), evt(2)] });
    expect(await cache.getScoped(scopeA, "s1")).not.toBeNull();
    // Different serverEpoch → miss (encoded key differs).
    expect(await cache.getScoped(scopeB, "s1")).toBeNull();
    // Different source generation → miss without touching the current row.
    expect(await cache.getScoped(scopeC, "s1")).toBeNull();
    expect(await cache.getScoped(scopeA, "s1")).not.toBeNull();
    await cache.deleteScoped(scopeC, "s1");
    expect(await cache.getScoped(scopeA, "s1")).not.toBeNull();

    // Legacy unscoped entry misses under a scoped reader (key separation).
    await cache.put("legacy", { maxSeq: 1, payload: [evt(1)] });
    expect(await cache.get("legacy")).not.toBeNull();
    expect(await cache.getScoped(scopeA, "legacy")).toBeNull();
  });

  it("delete dominates a put held at the pre-commit barrier", async () => {
    let entered!: () => void;
    let release!: () => void;
    const preCommit = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = createReplayCache({
      factory,
      beforePutCommit: async () => {
        entered();
        await commit;
      },
    });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };

    const putP = cache.putScoped(scope, "s1", { maxSeq: 2, payload: [evt(1), evt(2)] });
    await preCommit;
    // deleteScoped bumps the generation synchronously while putP is paused;
    // releasing the barrier must not allow the stale put to commit.
    const deleteP = cache.deleteScoped(scope, "s1");
    release();
    await Promise.all([putP, deleteP]);
    expect(await cache.getScoped(scope, "s1")).toBeNull();

    // A fresh put after the fence still works (generation fence is not permanent).
    await cache.putScoped(scope, "s1", { maxSeq: 5, payload: [evt(5)] });
    const hit = await cache.getScoped(scope, "s1");
    expect(hit).not.toBeNull();
    expect(hit!.maxSeq).toBe(5);
  });

  it("peekScoped reads without LRU touch or invalid-entry deletion and honors abort", async () => {
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };
    const cache = createReplayCache({ factory, maxEntries: 2 });
    await cache.putScoped(scope, "a", { maxSeq: 1, payload: [evt(1)] });
    await cache.putScoped(scope, "b", { maxSeq: 1, payload: [evt(1)] });
    expect(await cache.peekScoped(scope, "a")).not.toBeNull();
    expect(await cache.peekScoped(scope, "a", () => false)).toBeNull();
    // An aborted read is a miss only; it must not delete or otherwise mutate
    // the durable row before the later eviction check.
    expect(await cache.peekScoped(scope, "a")).not.toBeNull();
    await cache.putScoped(scope, "c", { maxSeq: 1, payload: [evt(1)] });
    // peekScoped did not promote a above b; a is still the LRU victim.
    expect(await cache.peekScoped(scope, "a")).toBeNull();
    expect(await cache.peekScoped(scope, "b")).not.toBeNull();
  });

  it("a stale read commits nothing (no touch/resurrect after a drop)", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };

    await cache.putScoped(scope, "s1", { maxSeq: 2, payload: [evt(1), evt(2)] });
    // Start a read, then drop before the read resolves.
    const getP = cache.getScoped(scope, "s1");
    await cache.deleteScoped(scope, "s1");
    const hit = await getP;
    expect(hit).toBeNull();
    // The stale read must not have touched/resurrected the entry.
    expect(await cache.getScoped(scope, "s1")).toBeNull();
  });

  it("scoped put stores source generation, schema, contiguous bounds, and window metadata", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };

    await cache.putScoped(scope, "s1", { maxSeq: 3, payload: [evt(1), evt(2), evt(3)] });
    const hit = await cache.getScoped(scope, "s1");
    expect(hit).not.toBeNull();
    // Source generation + schema.
    expect(hit!.serverEpoch).toBe("server-7");
    expect(hit!.sourceGeneration).toBe("source-a");
    expect(hit!.schemaVersion).toBe(REPLAY_CACHE_SCHEMA_VERSION);
    // Contiguous min/max.
    expect(hit!.minSeq).toBe(1);
    expect(hit!.maxSeq).toBe(3);
    // Window metadata.
    expect(hit!.hasMoreOlder).toBe(false);
    expect(hit!.partialHead).toBe(false);
    expect(hit!.bytes).toBeGreaterThan(0);
    // Prepared suffix retained in seq order.
    expect(hit!.payload.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("scoped put persists the prepared (truncated) event suffix", async () => {
    const cache = createReplayCache({ factory, maxBytesPerSession: 300 * 1024 });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };

    // A tool_execution_end with a result far over the shared replay text budget
    // is truncated by prepareEventForReplay inside selectNewestEventsByBudget, so
    // the stored suffix is the PREPARED event, not the raw one.
    const huge = "x".repeat(DEFAULT_MAX_REPLAY_TEXT_BYTES + 1000);
    const raw = toolEnd(1, huge);
    await cache.putScoped(scope, "s1", { maxSeq: 1, payload: [raw] });
    const hit = await cache.getScoped(scope, "s1");
    expect(hit).not.toBeNull();
    const stored = (hit!.payload[0]!.event.data as { result: string }).result;
    expect(stored.length).toBeLessThan(huge.length);
    expect(stored).toContain(REPLAY_BYTE_TRUNCATION_MARKER);
  });
});
