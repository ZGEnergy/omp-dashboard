import {
  DEFAULT_MAX_REPLAY_TEXT_BYTES,
  REPLAY_BYTE_TRUNCATION_MARKER,
} from "@blackbelt-technology/pi-dashboard-shared/prepare-event-for-replay.js";
import { isCoverageContiguous } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
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
  it("stores projected exact events 1 and 101 with skipped range 2..100 and retains non-empty payload and logical bounds/range", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-8", sourceGeneration: "source-b" };

    await cache.putScoped(scope, "s-skipped", {
      maxSeq: 101,
      payload: [evt(1), evt(101)],
      skippedSeqRanges: [{ fromSeq: 2, toSeq: 100 }],
    });

    const hit = await cache.getScoped(scope, "s-skipped");
    expect(hit).not.toBeNull();
    expect(hit!.payload).toHaveLength(2);
    expect(hit!.payload.map((e) => e.seq)).toEqual([1, 101]);
    expect(hit!.minSeq).toBe(1);
    expect(hit!.maxSeq).toBe(101);
    expect(hit!.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 100 }]);
  });

  it("round-trips schema-v4 cache entry with skippedSeqRanges and scope metadata", async () => {
    expect(REPLAY_CACHE_SCHEMA_VERSION).toBe(4);

    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-v4", sourceGeneration: "gen-v4" };

    const putData = {
      maxSeq: 25,
      payload: [evt(1), evt(25)],
      skippedSeqRanges: [{ fromSeq: 2, toSeq: 24 }],
    };

    await cache.putScoped(scope, "s-v4", putData);

    const hit = await cache.getScoped(scope, "s-v4");
    expect(hit).not.toBeNull();
    expect(hit!.schemaVersion).toBe(4);
    expect(hit!.serverEpoch).toBe("server-v4");
    expect(hit!.sourceGeneration).toBe("gen-v4");
    expect(hit!.minSeq).toBe(1);
    expect(hit!.maxSeq).toBe(25);
    expect(hit!.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 24 }]);
    expect(hit!.payload.map((e) => e.seq)).toEqual([1, 25]);
  });
  it("retains only range metadata owned by surviving exact suffix under byte cap and recomputes logical minSeq and range bounds", async () => {
    // Projected exacts 1, 101, 201 with gap ranges 2..100 and 102..200.
    // Under a byte cap that fits exact 201 + range 102..200 metadata but drops exact 1 and 101,
    // only the range leading into exact 201 (102..200) is retained.
    const evt1 = evt(1);
    const evt101 = evt(101);
    const evt201 = evt(201);
    const range1 = { fromSeq: 2, toSeq: 100 };
    const range2 = { fromSeq: 102, toSeq: 200 };

    const evt201Bytes = new TextEncoder().encode(JSON.stringify(evt201)).byteLength;
    const range2Bytes = new TextEncoder().encode(JSON.stringify(range2)).byteLength;
    // Calculate cap honestly: fits exact 201 + range 102..200 metadata + envelope overhead,
    // but strictly less than exact 101 + exact 201 payload.
    const exact201WithRangeCap = evt201Bytes + range2Bytes + 25;

    const cache = createReplayCache({ factory, maxBytesPerSession: exact201WithRangeCap });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };

    await cache.putScoped(scope, "s1", {
      maxSeq: 201,
      payload: [evt1, evt101, evt201],
      skippedSeqRanges: [range1, range2],
      skippedRanges: [{ startSeq: 2, endSeq: 100 }, { startSeq: 102, endSeq: 200 }],
      ranges: [{ minSeq: 2, maxSeq: 100 }, { minSeq: 102, maxSeq: 200 }],
    } as any);

    const hit = await cache.getScoped(scope, "s1");

    expect(hit).not.toBeNull();
    expect(hit!.payload.map((e) => e.seq)).toEqual([201]);

    const hitRanges = hit!.skippedSeqRanges ?? (hit as any)?.skippedRanges ?? (hit as any)?.ranges;
    expect(hitRanges).toBeDefined();
    expect(hitRanges).toHaveLength(1);

    const rangeStart = hitRanges[0].fromSeq ?? hitRanges[0].startSeq ?? hitRanges[0].minSeq;
    const rangeEnd = hitRanges[0].toSeq ?? hitRanges[0].endSeq ?? hitRanges[0].maxSeq;

    expect(rangeStart).toBe(102);
    expect(rangeEnd).toBe(200);

    expect(hit!.minSeq).toBe(102);
    expect(hit!.maxSeq).toBe(201);

    // Contiguous rehydrate coverage: leading skipped range ends at 200, next event in payload is seq 201.
    expect(rangeEnd + 1).toBe(hit!.payload[0]!.seq);

    // Total persisted payload + range metadata JSON fits byte cap.
    const totalBytes = hit!.bytes ?? new TextEncoder().encode(JSON.stringify(hit)).byteLength;
    expect(totalBytes).toBeLessThanOrEqual(exact201WithRangeCap);
  });
  it("enforces 20KiB tool payload cap on merged tool start/update/end events and retains representative event and skipped ranges", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-tool-cap", sourceGeneration: "source-tool-cap" };

    // 3 tool events for one tool call, each individually store-safe (~8 KiB < 20 KiB),
    // but merged args + details + result (~24 KiB) exceed 20 KiB.
    const startEvt: CachedEvent = {
      seq: 1,
      event: {
        sessionId: "s-tool-cap",
        eventType: "tool_execution_start",
        timestamp: 100,
        data: {
          toolCallId: "tc-heavy-123",
          toolName: "bash",
          args: { command: "a".repeat(8000) },
        },
      } as unknown as DashboardEvent,
    };

    const updateEvt: CachedEvent = {
      seq: 2,
      event: {
        sessionId: "s-tool-cap",
        eventType: "tool_execution_update",
        timestamp: 101,
        data: {
          toolCallId: "tc-heavy-123",
          toolName: "bash",
          details: { output: "b".repeat(8000) },
        },
      } as unknown as DashboardEvent,
    };

    const endEvt: CachedEvent = {
      seq: 3,
      event: {
        sessionId: "s-tool-cap",
        eventType: "tool_execution_end",
        timestamp: 102,
        data: {
          toolCallId: "tc-heavy-123",
          toolName: "bash",
          status: "completed",
          result: "c".repeat(8000),
        },
      } as unknown as DashboardEvent,
    };

    await cache.putScoped(scope, "s-tool-cap", {
      maxSeq: 3,
      payload: [startEvt, updateEvt, endEvt],
    });

    const hit = await cache.getScoped(scope, "s-tool-cap");
    expect(hit).not.toBeNull();

    // The merged payload must be bounded so event.data serialized UTF-8 <= 20*1024
    for (const cached of hit!.payload) {
      const dataBytes = new TextEncoder().encode(JSON.stringify(cached.event.data)).byteLength;
      expect(dataBytes).toBeLessThanOrEqual(20 * 1024);
    }

    // Must retain representative event with useful identity/display/terminal metadata
    const representative = hit!.payload[hit!.payload.length - 1]!;
    const data = representative.event.data as Record<string, unknown>;
    expect(data.toolCallId).toBe("tc-heavy-123");
    expect(data.toolName).toBe("bash");
    expect(data.status).toBe("completed");
    expect(data).toHaveProperty("result");

    // Must record skippedSeqRanges when intermediate events are skipped/coalesced
    if (hit!.payload.length < 3) {
      expect(hit!.skippedSeqRanges).toBeDefined();
      expect(hit!.skippedSeqRanges!.length).toBeGreaterThan(0);
    }
  });
  it("combines projected tool burst skippedSeqRanges with putScoped value payload and asserts contiguous logical coverage", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-tool-burst", sourceGeneration: "gen-burst" };

    const userEvt: CachedEvent = {
      seq: 1,
      event: {
        sessionId: "s-burst",
        eventType: "user_message",
        timestamp: 100,
        data: { text: "hello" },
      } as unknown as DashboardEvent,
    };

    const toolStart: CachedEvent = {
      seq: 2,
      event: {
        sessionId: "s-burst",
        eventType: "tool_execution_start",
        timestamp: 101,
        data: { toolCallId: "tc-1", toolName: "read" },
      } as unknown as DashboardEvent,
    };

    const toolUpdate: CachedEvent = {
      seq: 3,
      event: {
        sessionId: "s-burst",
        eventType: "tool_execution_update",
        timestamp: 102,
        data: { toolCallId: "tc-1", toolName: "read", details: { text: "partial" } },
      } as unknown as DashboardEvent,
    };

    const toolEnd: CachedEvent = {
      seq: 4,
      event: {
        sessionId: "s-burst",
        eventType: "tool_execution_end",
        timestamp: 103,
        data: { toolCallId: "tc-1", toolName: "read", status: "completed", result: "ok" },
      } as unknown as DashboardEvent,
    };

    await cache.putScoped(scope, "s-burst", {
      maxSeq: 4,
      payload: [userEvt, toolStart, toolUpdate, toolEnd],
    });

    const hit = await cache.getScoped(scope, "s-burst");
    expect(hit).not.toBeNull();
    expect(hit!.payload.map((e) => e.seq)).toEqual([1, 4]);
    expect(hit!.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 3 }]);
    expect(hit!.minSeq).toBe(1);
    expect(hit!.maxSeq).toBe(4);
    expect(isCoverageContiguous(hit!.payload, hit!.skippedSeqRanges ?? [], hit!.minSeq!, hit!.maxSeq!)).toBe(true);
  });
});
