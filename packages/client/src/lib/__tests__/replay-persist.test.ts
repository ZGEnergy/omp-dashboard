import { isCoverageContiguous } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { type CachedEvent, createReplayCache, type ReplayCache } from "../replay-cache.js";
import { createReplayPersister } from "../replay-persist.js";

function evt(seq: number): CachedEvent {
  return {
    seq,
    event: { sessionId: "s", eventType: "message_end", timestamp: seq, data: {} } as unknown as DashboardEvent,
  };
}

describe("replay-persist", () => { let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

it("records events and flushes the buffer to the cache with the right maxSeq", async () => {
  const cache = createReplayCache({ factory });
  const p = createReplayPersister(cache, 0);
  p.record("s1", [evt(1), evt(2)]);
  p.record("s1", [evt(3)]);
  await p.flush("s1");

  const hit = await cache.get("s1");
  expect(hit?.maxSeq).toBe(3);
  expect(hit?.payload.map((e) => e.seq)).toEqual([1, 2, 3]);
});

it("dedups events already in the buffer by seq", async () => {
  const cache = createReplayCache({ factory });
  const p = createReplayPersister(cache, 0);
  p.record("s1", [evt(1), evt(2)]);
  p.record("s1", [evt(2), evt(3)]); // seq 2 is a duplicate
  await p.flush("s1");
  expect((await cache.get("s1"))?.payload.map((e) => e.seq)).toEqual([1, 2, 3]);
});

it("seed replaces the buffer wholesale", async () => {
  const cache = createReplayCache({ factory });
  const p = createReplayPersister(cache, 0);
  p.record("s1", [evt(1), evt(2), evt(3)]);
  p.seed("s1", [evt(10)]);
  await p.flush("s1");
  expect((await cache.get("s1"))?.payload.map((e) => e.seq)).toEqual([10]);
});

it("drop clears the buffer and deletes the persisted entry", async () => {
  const cache = createReplayCache({ factory });
  const p = createReplayPersister(cache, 0);
  p.record("s1", [evt(1)]);
  await p.flush("s1");
  expect(await cache.get("s1")).not.toBeNull();

  await p.drop("s1");
  // Buffer cleared: a later flush writes nothing back.
  await p.flush("s1");
  expect(await cache.get("s1")).toBeNull();
});
  it("bounds the live in-memory buffer before flushing", () => {
    const cache = createReplayCache({ factory });
    const evt3 = evt(3);
    const evt5 = evt(5);
    const range4 = [{ fromSeq: 4, toSeq: 4 }];
    const bytesEvt3 = new TextEncoder().encode(JSON.stringify(evt3)).byteLength;
    const bytesEvt5 = new TextEncoder().encode(JSON.stringify(evt5)).byteLength;
    const bytesRange4 = new TextEncoder().encode(JSON.stringify(range4)).byteLength;
    const maxRetainedBytes = bytesEvt3 + bytesEvt5 + bytesRange4;
    const p = createReplayPersister(cache, 1_000, undefined, maxRetainedBytes);

    p.record("s1", [evt(1), evt(3), evt(5)]);

    expect(p.snapshot("s1").map((event) => event.seq)).toEqual([3, 5]);
    p.dispose();
  });
});

// Phase 6 hardening: scoped (serverEpoch, authority) write path, drop dominance
// over queued puts, and dispose that cancels timers/buffers without deleting
// committed state. See change: mobile-session-rehydration.
describe("replay-persist — scoped + dispose", () => {
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

  it("writes under the encoded scope; a legacy unscoped reader misses", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };
    const p = createReplayPersister(cache, 0, scope);
    p.record("s1", [evt(1), evt(2)]);
    await p.flush("s1");
    expect(await cache.getScoped(scope, "s1")).not.toBeNull();
    // The scoped entry is keyed by [serverEpoch, sourceGeneration, sessionId]; the
    // legacy bare-sessionId reader misses it.
    expect(await cache.get("s1")).toBeNull();
  });

  it("drop dominates a queued debounced put (no entry survives)", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };
    const p = createReplayPersister(cache, 0, scope);
    // record schedules a 0ms debounce put; drop cancels the timer and clears the
    // buffer so neither the queued nor an in-flight put can leave an entry.
    p.record("s1", [evt(1), evt(2)]);
    await p.drop("s1");
    await p.flush("s1"); // buffer cleared → no-op
    expect(await cache.getScoped(scope, "s1")).toBeNull();
  });


  it("dispose fences a deferred flush before its cache put commits", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };
    let started!: () => void;
    let release!: () => void;
    const putStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const deferredPut = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gatedCache: ReplayCache = {
      ...cache,
      putScoped: async (putScope, sessionId, value, canCommit) => {
        started();
        await deferredPut;
        await cache.putScoped(putScope, sessionId, value, canCommit);
      },
    };
    const p = createReplayPersister(gatedCache, 0, scope);
    p.record("in-flight", [evt(1), evt(2)]);
    const flushP = p.flush("in-flight");
    await putStarted;
    p.dispose();
    release();
    await flushP;

    // The deferred cache put resumes after dispose, but its commit guard is
    // false, so no row is written. This observes durable state, not just calls.
    expect(await cache.getScoped(scope, "in-flight")).toBeNull();
  });

  it("dispose cancels pending timers and prevents later flushes without deleting committed state", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-7", sourceGeneration: "source-a" };
    const p = createReplayPersister(cache, 5, scope);
    // Committed state: flush before dispose.
    p.record("committed", [evt(5)]);
    await p.flush("committed");
    expect(await cache.getScoped(scope, "committed")).not.toBeNull();
    // Pending write: record (schedules a 5ms timer), then dispose immediately.
    p.record("pending", [evt(1), evt(2)]);
    p.dispose();
    // Any surviving timer would have fired by now.
    await new Promise((r) => setTimeout(r, 30));
    expect(await cache.getScoped(scope, "pending")).toBeNull();
    // Post-dispose flush is a no-op.
    await p.flush("pending");
    expect(await cache.getScoped(scope, "pending")).toBeNull();
    // Committed state is NOT deleted by dispose.
    expect(await cache.getScoped(scope, "committed")).not.toBeNull();
  });

  it("bytes() reports retained buffer bytes, 0 for unknown/disposed", () => {
    const cache = createReplayCache({ factory });
    const p = createReplayPersister(cache, 1000);
    expect(p.bytes("s1")).toBe(0); // unknown session
    p.record("s1", [evt(1), evt(2), evt(3)]);
    const retained = p.bytes("s1");
    expect(retained).toBeGreaterThan(0);
    // Matches the persister's own UTF-8 estimate of the retained events.
    const expected = p.snapshot("s1").reduce(
      (sum, e) => sum + new TextEncoder().encode(JSON.stringify(e)).byteLength,
      0,
    );
    expect(retained).toBe(expected);
    p.dispose();
    expect(p.bytes("s1")).toBe(0); // disposed
  });

  it("clips retained ranges to exact suffix and maintains contiguous rehydration coverage when trimmed", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-trim", sourceGeneration: "gen-trim" };
    // Small retention ceiling so seeding exact 1, 3, 5 overflows
    // and forces prefix (seq 1) to be trimmed from the retained buffer payload.
    const maxBytes =
      new TextEncoder().encode(JSON.stringify(evt(3))).byteLength +
      new TextEncoder().encode(JSON.stringify(evt(5))).byteLength +
      new TextEncoder().encode(
        JSON.stringify([
          { fromSeq: 2, toSeq: 2 },
          { fromSeq: 4, toSeq: 4 },
        ]),
      ).byteLength;
    const persister = createReplayPersister(cache, 1000, scope, maxBytes);

    const exactEvents = [evt(1), evt(3), evt(5)];
    const skippedSeqRanges = [
      { fromSeq: 2, toSeq: 2 },
      { fromSeq: 4, toSeq: 4 },
    ];

    persister.seed("s-trim", exactEvents, skippedSeqRanges);
    await persister.flush("s-trim");

    const hit = await cache.getScoped(scope, "s-trim");
    expect(hit).not.toBeNull();

    // Suffix trimming dropped seq 1, retaining exact 3 and 5.
    const retainedSeqList = hit!.payload.map((e) => e.seq);
    expect(retainedSeqList).toEqual([3, 5]);

    // Range 2..2 is retained as the leading range for exact 3; range 4..4 is kept intact.
    expect(hit!.skippedSeqRanges).toEqual([
      { fromSeq: 2, toSeq: 2 },
      { fromSeq: 4, toSeq: 4 },
    ]);

    // Rehydration coverage over the retained window [minSeq..maxSeq] must be contiguous.
    const minSeq = hit!.minSeq!;
    const maxSeq = hit!.maxSeq!;
    expect(minSeq).toBe(2);
    expect(maxSeq).toBe(5);
    expect(isCoverageContiguous(hit!.payload, hit!.skippedSeqRanges ?? [], minSeq, maxSeq)).toBe(true);
  });

  it("preserves leading skipped range when exact1 is evicted, leaving exact4 and range2..3 with minSeq 2", async () => {
    const cache = createReplayCache({ factory });
    const scope = { serverEpoch: "server-lead", sourceGeneration: "gen-lead" };

    const exactEvents = [evt(1), evt(4)];
    const skippedSeqRanges = [{ fromSeq: 2, toSeq: 3 }];

    // Budget fits evt(4) and range 2..3, but not evt(1)
    const maxBytes =
      new TextEncoder().encode(JSON.stringify(evt(4))).byteLength +
      new TextEncoder().encode(JSON.stringify(skippedSeqRanges)).byteLength;

    const persister = createReplayPersister(cache, 1000, scope, maxBytes);
    persister.seed("s-lead", exactEvents, skippedSeqRanges);
    await persister.flush("s-lead");

    const hit = await cache.getScoped(scope, "s-lead");
    expect(hit).not.toBeNull();
    expect(hit!.payload.map((e) => e.seq)).toEqual([4]);
    expect(hit!.skippedSeqRanges).toEqual([{ fromSeq: 2, toSeq: 3 }]);
    expect(hit!.minSeq).toBe(2);
    expect(hit!.maxSeq).toBe(4);
    expect(isCoverageContiguous(hit!.payload, hit!.skippedSeqRanges ?? [], hit!.minSeq!, hit!.maxSeq!)).toBe(true);
  });
});
