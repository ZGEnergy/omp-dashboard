import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { createReplayCache, type CachedEvent, type ReplayCache, type ReplayCacheScope } from "../replay-cache.js";
import { rehydrateSession } from "../rehydrate-session.js";

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

async function delayedPeekCache() {
  const backing = createReplayCache({ factory: new IDBFactory() });
  await backing.putScoped(scope, "delayed", { maxSeq: 2, payload: [userMsg(1, "hello"), userMsg(2, "world")] });
  const entry = await backing.peekScoped(scope, "delayed");
  if (!entry) throw new Error("test setup failed to seed cache");

  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
  let release!: () => void;
  let admittedAtRelease = true;
  let touches = 0;
  const deletes: Array<{ scope: ReplayCacheScope; sessionId: string }> = [];
  const cache = {
    ...backing,
    peekScoped: (_scope: ReplayCacheScope, _sessionId: string, canUse: () => boolean = () => true) => {
      resolveStarted();
      return new Promise<typeof entry | null>((resolve) => {
        release = () => {
          admittedAtRelease = canUse();
          if (admittedAtRelease) touches += 1;
          resolve(admittedAtRelease ? entry : null);
        };
      });
    },
    deleteScoped: async (deletedScope: ReplayCacheScope, sessionId: string) => {
      deletes.push({ scope: deletedScope, sessionId });
      await backing.deleteScoped(deletedScope, sessionId);
    },
  } as ReplayCache;
  return {
    backing,
    cache,
    started,
    release: () => release(),
    get admittedAtRelease() { return admittedAtRelease; },
    get touches() { return touches; },
    deletes,
  };
}

describe("rehydrateSession", () => {
  let factory: IDBFactory;
  beforeEach(() => {
    factory = new IDBFactory();
  });

  it("returns lastSeq = persistedMaxSeq and re-reduces state from the cached events", async () => {
    const cache = createReplayCache({ factory });
    await cache.putScoped(scope, "s1", { maxSeq: 7, payload: [userMsg(5, "hello"), userMsg(6, "world")] });

    const result = await rehydrateSession("s1", cache, authority());
    expect(result).not.toBeNull();
    expect(result?.lastSeq).toBe(6);
    expect(result?.events.map((e) => e.seq)).toEqual([5, 6]);
    // Re-reduced state carries the cached user messages (not an empty chat).
    expect(result?.state.messages.length).toBeGreaterThan(0);
  });

  it("returns null when the session has no cache entry", async () => {
    const cache = createReplayCache({ factory });
    expect(await rehydrateSession("missing", cache, authority())).toBeNull();
  });

  it("does not admit or delete a scoped cache read that resolves after its deadline", async () => {
    const delayed = await delayedPeekCache();
    const resultPromise = rehydrateSession("delayed", delayed.cache, {
      authority: authority().authority,
      admissionDeadlineMs: 0,
    });
    await delayed.started;
    expect(await resultPromise).toBeNull();

    delayed.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(delayed.admittedAtRelease).toBe(false);
    expect(delayed.touches).toBe(0);
    expect(delayed.deletes).toEqual([]);
    expect(await delayed.backing.peekScoped(scope, "delayed")).not.toBeNull();
  });

  it("does not admit or delete a scoped cache read that resolves after abort", async () => {
    const delayed = await delayedPeekCache();
    const controller = new AbortController();
    const resultPromise = rehydrateSession("delayed", delayed.cache, {
      authority: { scope, signal: controller.signal, isCurrent: () => true },
    });
    await delayed.started;
    controller.abort();
    expect(await resultPromise).toBeNull();

    delayed.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(delayed.admittedAtRelease).toBe(false);
    expect(delayed.touches).toBe(0);
    expect(delayed.deletes).toEqual([]);
    expect(await delayed.backing.peekScoped(scope, "delayed")).not.toBeNull();
  });
});
