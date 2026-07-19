/**
 * Regression suite for change: fix-reducer-crash-undefined-toolname
 *
 * `rehydrateSession` re-reduces the durable IndexedDB replay cache at App
 * level — above every React error boundary. A single malformed cached event that
 * makes the reducer throw would therefore unmount the whole app (black screen).
 * The cache is an optimization only: a re-reduce failure MUST degrade to a full
 * replay (cache miss), never propagate.
 *
 * These tests assert the fault-isolation independently of the reducer's own
 * toolName tolerance: the poisoned payload uses a `tool_execution_start` with
 * `data: null`, which the reducer does not (and need not) tolerate — standing in
 * for any future malformed cached event.
 */

import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { rehydrateSession } from "../rehydrate-session.js";
import { type CachedEvent, type ReplayCache, type ReplayCacheScope, createReplayCache } from "../replay-cache.js";

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

/** A cached event the reducer cannot reduce (`data: null` on a handler that
 * dereferences `data`) — stands in for any malformed cached event that makes
 * the re-reduce throw during rehydrate. */
function poisonedEvent(seq: number): CachedEvent {
  return {
    seq,
    event: {
      sessionId: "s",
      eventType: "tool_execution_start",
      timestamp: seq,
      data: null,
    } as unknown as DashboardEvent,
  };
}

describe("rehydrateSession — poisoned cache entry", () => {
  let factory: IDBFactory;
  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("contains malformed prepared events without throwing outside React", async () => {
    const cache = createReplayCache({ factory });
    await cache.putScoped(scope, "s1", { maxSeq: 6, payload: [userMsg(5, "hi"), poisonedEvent(6)] });

    // The shared preparation boundary makes malformed tool rows recoverable;
    // rehydration never throws above React's error boundary.
    const result = await rehydrateSession("s1", cache, authority());
    expect(result).not.toBeNull();
    expect(result?.lastSeq).toBe(6);
  });

  it("still delta-rehydrates a healthy cache entry", async () => {
    const cache = createReplayCache({ factory });
    await cache.putScoped(scope, "s2", { maxSeq: 6, payload: [userMsg(5, "hello"), userMsg(6, "world")] });

    const result = await rehydrateSession("s2", cache, authority());
    expect(result).not.toBeNull();
    expect(result?.lastSeq).toBe(6);
    expect(result?.state.messages.length).toBeGreaterThan(0);
  });

  it("deletes malformed payloads only from the current server/source scope", async () => {
    const deleted: Array<{ scope: ReplayCacheScope; sessionId: string }> = [];
    const cache = {
      peekScoped: async () => ({
        key: "poisoned",
        sessionId: "s3",
        schemaVersion: 3,
        maxSeq: 7,
        payload: [userMsg(5, "hello"), userMsg(7, "gap")],
        lastAccess: 1,
        serverEpoch: scope.serverEpoch,
        sourceGeneration: scope.sourceGeneration,
      }),
      deleteScoped: async (deletedScope: ReplayCacheScope, sessionId: string) => {
        deleted.push({ scope: deletedScope, sessionId });
      },
    } as unknown as ReplayCache;

    expect(await rehydrateSession("s3", cache, authority())).toBeNull();
    expect(deleted).toEqual([{ scope, sessionId: "s3" }]);
  });
});
