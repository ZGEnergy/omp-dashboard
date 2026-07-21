/**
 * Durable per-session replay cache (Strategy A).
 *
 * Persists the raw replayed event tail + cursor for each session to IndexedDB
 * so a page reload can resubscribe with `lastSeq = maxSeq` (delta replay)
 * instead of `lastSeq: 0` (full replay). The cache is an OPTIMIZATION ONLY:
 * any miss, schemaVersion mismatch, eviction, or IndexedDB error degrades to a
 * full (or server tail) replay with no error surfaced to the user.
 *
 * Decision (design.md 1.1): persist RAW events (`{ seq, event }[]`), not reduced
 * `ChatMessage[]`. The reducer is pure, so re-reducing on load is cheap and the
 * cache binds only to the stable event wire schema — keeping `schemaVersion`
 * bumps rare.
 *
 * Over-budget put trims to newest-by-byte-budget (session-tail-rehydrate)
 * rather than deleting the entry (which forced cold full replay).
 *
 * Phase 6 hardening (mobile-session-rehydration): the cache is server-scoped by
 * `[serverEpoch, sourceGeneration]`. Scoped reads/writes key entries by the encoded
 * triple `[serverEpoch, sourceGeneration, sessionId]`, so a reconnect to a different
 * server/epoch cannot stitch stale history onto fresh sequence numbers. Legacy
 * unscoped entries (keyed by the bare `sessionId`) MISS under scoped reads.
 * Operations are serialized per key and generation-fenced: `delete` bumps the
 * key generation synchronously, so a stale in-flight put/read captured before
 * the drop commits nothing and cannot resurrect the entry. Scoped puts store
 * the prepared contiguous suffix + window metadata (selectNewestEventsByBudget).
 *
 * See change: reduce-session-replay-traffic, session-tail-rehydrate,
 * mobile-session-rehydration.
 */
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { selectNewestEventsByBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { prepareEventForReplay } from "@blackbelt-technology/pi-dashboard-shared/prepare-event-for-replay.js";

/** Bump on any persisted-shape change → all entries invalidate (full replay).
 *  v2: over-budget put trims to newest-by-byte-budget instead of drop-all.
 *  v3: server-scoped entry shape (key, serverEpoch, sourceGeneration, minSeq, window
 *      metadata, prepared suffix) + IDB store keyed by the composite `key`. */
export const REPLAY_CACHE_SCHEMA_VERSION = 3;

const DB_NAME = "pi-dashboard-replay-cache";
const STORE = "sessions";
const DB_VERSION = 2;
const DEFAULT_MAX_ENTRIES = 50;
/** Per-session payload byte budget (~4 MB newest events). Over → trim-on-put. */
const DEFAULT_MAX_BYTES_PER_SESSION = 4 * 1024 * 1024;

export interface CachedEvent {
  seq: number;
  event: DashboardEvent;
}

/** Server scope identifying the authoritative source of a cached tail. A
 *  reconnect that changes either field must not reuse the prior tail. */
export interface ReplayCacheScope {
  /** Opaque server-process identity from sessions_snapshot. */
  serverEpoch: string;
  /** Opaque authoritative source revision for this session. */
  sourceGeneration: string;
}

export interface ReplayCacheEntry {
  /** IDB key. Encoded `[serverEpoch, sourceGeneration, sessionId]` for scoped
   *  entries, the bare `sessionId` for legacy unscoped entries. */
  key: string;
  /** Human-readable session id (always the unencoded value). */
  sessionId: string;
  schemaVersion: number;
  maxSeq: number;
  payload: CachedEvent[];
  lastAccess: number;
  // Scoped-entry fields (absent on legacy unscoped entries).
  /** Opaque server-process identity that authored this tail. */
  serverEpoch?: string;
  /** Opaque source revision that authored this tail. */
  sourceGeneration?: string;
  /** Contiguous window low seq (== windowMinSeq). */
  minSeq?: number;
  /** More older events exist below minSeq (not retained). */
  hasMoreOlder?: boolean;
  /** The retained suffix starts mid-turn (oldest kept event is not a user-turn
   *  boundary), so the reducer must tolerate a partial head. */
  partialHead?: boolean;
  /** UTF-8 size of the retained `{seq,event}` envelopes (window metadata). */
  bytes?: number;
}

export interface ReplayCachePut {
  maxSeq: number;
  payload: CachedEvent[];
}

export interface ReplayCacheOptions {
  /** Injectable IndexedDB factory (tests pass a fresh `new IDBFactory()`). */
  factory?: IDBFactory;
  /** Max retained sessions before LRU eviction by `lastAccess`. */
  maxEntries?: number;
  /** Per-session serialized-payload byte cap; over-cap sessions are not persisted. */
  maxBytesPerSession?: number;
  /** Override the schema version (tests simulate drift). */
  schemaVersion?: number;
  /** Awaited by put operations immediately before their durable commit (tests). */
  beforePutCommit?: () => Promise<void>;
}

export interface ReplayCache {
  /** Legacy unscoped read (keyed by the bare sessionId). */
  get(sessionId: string): Promise<ReplayCacheEntry | null>;
  /** Legacy unscoped write. */
  put(sessionId: string, value: ReplayCachePut, canCommit?: () => boolean): Promise<void>;
  /** Legacy unscoped delete. */
  delete(sessionId: string): Promise<void>;
  /** Server-scoped read. Legacy unscoped entries miss here. */
  getScoped(scope: ReplayCacheScope, sessionId: string): Promise<ReplayCacheEntry | null>;
  /** Side-effect-free scoped read: never touches LRU or deletes invalid entries. */
  peekScoped(
    scope: ReplayCacheScope,
    sessionId: string,
    canUse?: () => boolean,
  ): Promise<ReplayCacheEntry | null>;
  /** Server-scoped write: prepares + windows the suffix and stores metadata. */
  putScoped(
    scope: ReplayCacheScope,
    sessionId: string,
    value: ReplayCachePut,
    canCommit?: () => boolean,
  ): Promise<void>;
  /** Server-scoped delete. Bumps the key generation synchronously so a stale
   *  in-flight put/read cannot resurrect the entry. */
  deleteScoped(scope: ReplayCacheScope, sessionId: string): Promise<void>;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Encode the scoped cache key. Control-char separators prevent collision with
 *  user content that might appear in `serverEpoch`, `sourceGeneration`, or
 *  `sessionId`. */
function encodeCacheKey(scope: ReplayCacheScope, sessionId: string): string {
  return `\u0001${scope.serverEpoch}\u0000${scope.sourceGeneration}\u0000${sessionId}`;
}

export function createReplayCache(opts: ReplayCacheOptions = {}): ReplayCache {
  const factory = opts.factory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytesPerSession = opts.maxBytesPerSession ?? DEFAULT_MAX_BYTES_PER_SESSION;
  const schemaVersion = opts.schemaVersion ?? REPLAY_CACHE_SCHEMA_VERSION;
  const beforePutCommit = opts.beforePutCommit;

  let dbPromise: Promise<IDBDatabase> | null = null;

  // Monotonic access stamp for LRU ordering. Wall-clock `Date.now()` TIES under
  // fast execution (multiple put/get in the same millisecond), making eviction
  // order non-deterministic. Track the last issued value and bump by 1 on a tie
  // so ordering is strictly increasing within the instance while staying ~wall-
  // clock (a fresh session's Date.now() dominates any persisted prior stamp).
  let lastStamp = 0;
  function nextStamp(): number {
    const now = Date.now();
    lastStamp = now > lastStamp ? now : lastStamp + 1;
    return lastStamp;
  }

  // Generation fence + per-key serialization (Phase 6). `generations` is
  // bumped SYNCHRONOUSLY by delete/deleteScoped so a put/get captured before
  // the drop sees a stale generation and commits/returns nothing — the deleted
  // entry cannot be resurrected. `chains` serializes all ops on the same
  // effective key so IDB read-modify-write (touch/evict) never interleaves with
  // a concurrent put/delete, and a drop queued behind an in-flight put still
  // runs last (delete dominance).
  const generations = new Map<string, number>();
  const chains = new Map<string, Promise<unknown>>();
  function genOf(key: string): number {
    return generations.get(key) ?? 0;
  }
  function bumpGen(key: string): void {
    generations.set(key, genOf(key) + 1);
  }
  function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(key, next.then(() => undefined, () => undefined));
    return next;
  }

  function openDb(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error("IndexedDB unavailable"));
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          // Recreate the store keyed by the composite `key` field. On upgrade
          // from v1 (keyPath "sessionId") the old store is replaced — legacy
          // entries drop (full replay), which is safe (cache is an optimization
          // only and schemaVersion also bumps to v3).
          if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
          db.createObjectStore(STORE, { keyPath: "key" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  // Raw IDB ops (by effective key). These do NOT serialize or bump generations
  // — they run inside a serialized body or as one-off maintenance (evict).
  async function rawGet(key: string): Promise<ReplayCacheEntry | null> {
    return safe(async () => {
      const db = await openDb();
      const tx = db.transaction(STORE, "readonly");
      const entry = (await promisify(tx.objectStore(STORE).get(key))) as
        | ReplayCacheEntry
        | undefined;
      await txDone(tx).catch(() => {});
      return entry ?? null;
    }, null);
  }

  async function rawPut(entry: ReplayCacheEntry, canCommit?: () => boolean): Promise<boolean> {
    return safe(async () => {
      if (canCommit && !canCommit()) return false;
      const db = await openDb();
      if (canCommit && !canCommit()) return false;
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).put(entry);
      if (canCommit) {
        request.onsuccess = () => {
          if (!canCommit()) {
            try {
              tx.abort();
            } catch {
              // The transaction may already have completed.
            }
          }
        };
      }
      await txDone(tx);
      return true;
    }, false);
  }

  async function rawDel(key: string): Promise<void> {
    await safe(async () => {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      await txDone(tx);
    }, undefined);
  }

  // Read-modify-write the lastAccess stamp in ONE transaction so a concurrent
  // put()/flush that landed between get()'s read and this write is not rolled
  // back to a stale payload/maxSeq snapshot. Only bumps lastAccess; never
  // resurrects a deleted entry.
  async function rawTouch(key: string): Promise<void> {
    await safe(async () => {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const current = (await promisify(store.get(key))) as ReplayCacheEntry | undefined;
      if (current) store.put({ ...current, lastAccess: nextStamp() });
      await txDone(tx);
    }, undefined);
  }

  async function rawEvict(): Promise<void> {
    await safe(async () => {
      const db = await openDb();
      const tx = db.transaction(STORE, "readonly");
      const all = (await promisify(tx.objectStore(STORE).getAll())) as ReplayCacheEntry[];
      await txDone(tx).catch(() => {});
      if (all.length <= maxEntries) return;
      // Evict least-recently-accessed first.
      all.sort((a, b) => a.lastAccess - b.lastAccess);
      const toEvict = all.slice(0, all.length - maxEntries);
      for (const e of toEvict) await rawDel(e.key ?? e.sessionId);
    }, undefined);
  }

  function maxSeqOf(buf: CachedEvent[]): number {
    let m = 0;
    for (const e of buf) if (e.seq > m) m = e.seq;
    return m;
  }

  // --- Server-scoped path -------------------------------------------------

  async function getScoped(scope: ReplayCacheScope, sessionId: string): Promise<ReplayCacheEntry | null> {
    const key = encodeCacheKey(scope, sessionId);
    const g = genOf(key);
    return serialize(key, async () => {
      // Stale read (a drop bumped the generation after we started): commit
      // nothing — return a miss and skip the touch so we never resurrect.
      if (genOf(key) !== g) return null;
      const entry = await rawGet(key);
      // A delete may race IndexedDB resolution. Re-check authority before
      // touching or returning data, making every stale read inert.
      if (genOf(key) !== g || !entry) return null;
      if (entry.schemaVersion !== schemaVersion ||
          entry.serverEpoch !== scope.serverEpoch ||
          entry.sourceGeneration !== scope.sourceGeneration) {
        if (genOf(key) === g) await rawDel(key);
        return null;
      }
      if (genOf(key) !== g) return null;
      await rawTouch(key);
      return genOf(key) === g ? entry : null;
    });
  }

  async function peekScoped(
    scope: ReplayCacheScope,
    sessionId: string,
    canUse?: () => boolean,
  ): Promise<ReplayCacheEntry | null> {
    const key = encodeCacheKey(scope, sessionId);
    const g = genOf(key);
    return serialize(key, async () => {
      if ((canUse && !canUse()) || genOf(key) !== g) return null;
      const entry = await rawGet(key);
      if ((canUse && !canUse()) || genOf(key) !== g) return null;
      if (!entry || entry.schemaVersion !== schemaVersion ||
          entry.serverEpoch !== scope.serverEpoch ||
          entry.sourceGeneration !== scope.sourceGeneration) return null;
      return entry;
    });
  }

  async function putScoped(
    scope: ReplayCacheScope,
    sessionId: string,
    value: ReplayCachePut,
    canCommit?: () => boolean,
  ): Promise<void> {
    const key = encodeCacheKey(scope, sessionId);
    const g = genOf(key);
    const allowed = () => genOf(key) === g && (!canCommit || canCommit());
    return serialize(key, async () => {
      // Stale put (a drop bumped the generation after we started): commit
      // nothing so the deleted entry cannot be resurrected.
      if (!allowed()) return;
      // Prepare + window the contiguous suffix via the shared algorithm so the
      // cache tail ≈ first paint tail (design D1). The returned events are
      // prepared (prepareEventForReplay) and bounded by the UTF-8 budget.
      const window = selectNewestEventsByBudget(
        value.payload.map(({ seq, event }) => ({ seq, event: prepareEventForReplay(event).event })),
        maxBytesPerSession,
      );
      let payload = window.events;
      let minSeq = window.windowMinSeq;
      let maxSeq = window.windowMaxSeq ?? value.maxSeq;
      let hasMoreOlder = window.hasMoreOlder;
      let partialHead = window.partialHead;
      // Recheck the full array serialization: selectNewestEventsByBudget sums
      // per-entry JSON.stringify length, but the persisted array adds commas +
      // brackets, so the trimmed window can still exceed maxBytesPerSession.
      // Drop oldest remaining events until the array fits or the window empties.
      while (payload.length > 0 && new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxBytesPerSession) {
        payload = payload.slice(1);
      }
      if (payload.length === 0) {
        if (allowed()) await rawDel(key);
        return;
      }
      // Recompute contiguous bounds + flags after the recheck-slice dropped
      // oldest events from the window.
      const finalMin = payload[0]!.seq;
      const finalMax = payload[payload.length - 1]!.seq;
      if (finalMin !== minSeq) {
        hasMoreOlder = true;
        partialHead = true;
        minSeq = finalMin;
      }
      maxSeq = finalMax;
      if (!allowed()) return;
      const entry: ReplayCacheEntry = {
        key,
        sessionId,
        schemaVersion,
        maxSeq,
        payload,
        lastAccess: nextStamp(),
        serverEpoch: scope.serverEpoch,
        sourceGeneration: scope.sourceGeneration,
        minSeq,
        hasMoreOlder,
        partialHead,
        bytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength,
      };
      // Check both sides of the durable mutation. A drop during preparation or
      // IndexedDB completion wins and removes the provisional value.
      if (!allowed()) return;
      if (beforePutCommit) await beforePutCommit();
      if (!allowed()) return;
      const committed = await rawPut(entry, allowed);
      if (!committed) return;
      if (genOf(key) !== g) {
        await rawDel(key);
        return;
      }
      await rawEvict();
    });
  }

  function deleteScoped(scope: ReplayCacheScope, sessionId: string): Promise<void> {
    const key = encodeCacheKey(scope, sessionId);
    // Synchronous generation bump dominates any in-flight put/read captured
    // before this drop: they see a stale generation and commit/return nothing.
    bumpGen(key);
    return serialize(key, () => rawDel(key));
  }

  // --- Legacy unscoped path (preserved for callers not yet scope-aware) ----

  async function get(sessionId: string): Promise<ReplayCacheEntry | null> {
    const key = sessionId;
    const g = genOf(key);
    return serialize(key, async () => {
      if (genOf(key) !== g) return null;
      const entry = await rawGet(key);
      if (!entry) return null;
      if (entry.schemaVersion !== schemaVersion) {
        await rawDel(key);
        return null;
      }
      await rawTouch(key);
      return entry;
    });
  }

  async function put(sessionId: string, value: ReplayCachePut, canCommit?: () => boolean): Promise<void> {
    const key = sessionId;
    const g = genOf(key);
    const allowed = () => genOf(key) === g && (!canCommit || canCommit());
    return serialize(key, async () => {
      if (!allowed()) return;
      // Over-budget: keep newest events that fit instead of dropping the entry.
      // Trimming fits the persisted ARRAY serialization (JSON.stringify of the
      // whole payload, including commas + brackets), not just the per-entry
      // byte sum from selectNewestEventsByBudget — a window whose per-entry sum
      // fits can still overflow once array overhead is counted. See change:
      // session-tail-rehydrate.
      let payload = value.payload;
      let maxSeq = value.maxSeq;
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxBytesPerSession) {
        const windowed = selectNewestEventsByBudget(payload, maxBytesPerSession);
        payload = windowed.events;
        maxSeq = windowed.windowMaxSeq || maxSeqOf(payload) || maxSeq;
      }
      // Recheck the full array serialization: selectNewestEventsByBudget sums
      // per-entry JSON.stringify length, but the persisted array adds commas +
      // brackets, so the trimmed window can still exceed maxBytesPerSession.
      // Drop oldest remaining events until the array fits or the window empties;
      // the newest event is retained throughout so maxSeq stays valid.
      while (payload.length > 0 && new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxBytesPerSession) {
        payload = payload.slice(1);
      }
      if (payload.length === 0) {
        if (allowed()) await rawDel(key);
        return;
      }
      const entry: ReplayCacheEntry = {
        key,
        sessionId,
        schemaVersion,
        maxSeq,
        payload,
        lastAccess: nextStamp(),
      };
      if (!allowed()) return;
      if (beforePutCommit) await beforePutCommit();
      if (!allowed()) return;
      if (!(await rawPut(entry, allowed))) return;
      await rawEvict();
    });
  }

  function deleteUnscoped(sessionId: string): Promise<void> {
    const key = sessionId;
    bumpGen(key);
    return serialize(key, () => rawDel(key));
  }

  return { get, put, delete: deleteUnscoped, getScoped, peekScoped, putScoped, deleteScoped };
}

/** App-wide singleton backed by the browser's IndexedDB. */
export const replayCache: ReplayCache = createReplayCache();
