import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { rehydrateSession } from "../rehydrate-session.js";
import { type CachedEvent, createReplayCache, type ReplayCacheScope } from "../replay-cache.js";

const scope: ReplayCacheScope = { serverEpoch: "server-a", sourceGeneration: "source-a" };

function authority() {
  const controller = new AbortController();
  return {
    authority: {
      scope,
      signal: controller.signal,
      isCurrent: () => true,
    },
  };
}

function userMsg(seq: number, text: string): CachedEvent {
  return {
    seq,
    event: {
      sessionId: "s",
      eventType: "message_start",
      timestamp: seq,
      data: { message: { role: "user", content: text } },
    } as unknown as DashboardEvent,
  };
}

describe("rehydrateSession — seed-seq tagging (#48 Slice 2 Task 2.1)", () => {
  let factory: IDBFactory;
  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("seeds a reducer whose messages carry .seq matching the cached entries, so a later evictBelow can prune them", async () => {
    const cache = createReplayCache({ factory });
    // A contiguous {seq,event}[] payload including a user turn, as a real
    // durable-cache hit would contain.
    await cache.putScoped(scope, "s1", {
      maxSeq: 3,
      payload: [userMsg(1, "one"), userMsg(2, "two"), userMsg(3, "three")],
    });

    const result = await rehydrateSession("s1", cache, authority());
    expect(result).not.toBeNull();
    expect(result?.minSeq).toBe(1);
    expect(result?.lastSeq).toBe(3);

    // The seeded reducer state is seq-tagged: every folded message carries
    // the .seq of the cached entry that produced it.
    const seqs = result?.state.messages.map((m) => m.seq).filter((s) => s !== undefined);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it("reflects entries[0].seq as minSeq when the cache entry omits an explicit minSeq", async () => {
    const cache = createReplayCache({ factory });
    await cache.putScoped(scope, "s2", {
      maxSeq: 12,
      payload: [userMsg(10, "a"), userMsg(11, "b"), userMsg(12, "c")],
    });

    const result = await rehydrateSession("s2", cache, authority());
    expect(result).not.toBeNull();
    expect(result?.minSeq).toBe(10);
  });
});
