/**
 * Debounced replay-cache persister (Strategy A write path).
 *
 * Owns the per-session RAW event buffer the client accumulates from `event` and
 * `event_replay` messages, and flushes it to the durable replay cache on a
 * debounce so a reload can delta-subscribe (`lastSeq = maxSeq`). The buffer is
 * monotonic by `seq` (appends skip already-seen seqs); a reset replaces it.
 *
 * Invalidation (Phase 4): `drop(sessionId)` clears the buffer AND deletes the
 * persisted entry so a `session_state_reset` never stitches stale history onto
 * reset sequence numbers. Phase 6: when a `ReplayCacheScope` is supplied the
 * writes/deletes go through the cache's scoped (serverEpoch, authority) API, and
 * `dispose()` cancels every pending timer + buffer WITHOUT deleting committed
 * state — a reconnect/foreground creates a fresh persister under the new scope.
 * `drop` dominates queued puts: it cancels the debounce timer, clears the
 * buffer, and (via the cache generation fence) any in-flight scoped put the drop
 * raced against commits nothing.
 *
 * See change: reduce-session-replay-traffic, mobile-session-rehydration.
 */
import { type CachedEvent, type ReplayCache, type ReplayCacheScope, replayCache } from "./replay-cache.js";

export interface ReplayPersister {
  /** Append events (dedup by seq) and schedule a debounced persist. */
  record(sessionId: string, events: CachedEvent[]): void;
  /** Replace the buffer wholesale (rehydrate seeding / replay reset). */
  seed(sessionId: string, events: CachedEvent[]): void;
  /** Clear buffer + delete the persisted entry (invalidation). Awaitable so a
   *  fast reload/close after session_state_reset can't race a surviving entry. */
  drop(sessionId: string): Promise<void>;
  /** Force an immediate flush (tests / unmount). */
  flush(sessionId: string): Promise<void>;
  /** Merge newly-arrived older events into the buffer (dedup by seq), returning the merged snapshot. See change: session-tail-rehydrate. */
  merge(sessionId: string, events: CachedEvent[]): CachedEvent[];
  /** Return a defensive copy of the current raw-event buffer. See change: session-tail-rehydrate. */
  snapshot(sessionId: string): CachedEvent[];
  /** Invalidate every pending timer + buffer without deleting committed cache
   *  state. After dispose, record/seed/merge/flush/drop are inert no-ops (no
   *  timers fire, no writes commit) and snapshot returns []. */
  dispose(): void;
}

export function createReplayPersister(
  cache: ReplayCache = replayCache,
  debounceMs = 1000,
  scope?: ReplayCacheScope,
): ReplayPersister {
  const buffers = new Map<string, CachedEvent[]>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Inert after dispose: no timers fire, no writes commit, no committed state
  // is deleted. The flag is the hard gate; clearing timers/buffers is the
  // physical invalidation so a surviving timer callback finds nothing to write.
  let disposed = false;
  let flushGeneration = 0;

  function maxSeqOf(buf: CachedEvent[]): number {
    let m = 0;
    for (const e of buf) if (e.seq > m) m = e.seq;
    return m;
  }

  function clearTimer(sessionId: string): void {
    const t = timers.get(sessionId);
    if (t) {
      clearTimeout(t);
      timers.delete(sessionId);
    }
  }

  async function flush(sessionId: string): Promise<void> {
    if (disposed) return;
    const generation = flushGeneration;
    clearTimer(sessionId);
    const buf = buffers.get(sessionId);
    if (!buf || buf.length === 0) return;
    const put = { maxSeq: maxSeqOf(buf), payload: [...buf] };
    const canCommit = () => !disposed && flushGeneration === generation;
    if (scope) await cache.putScoped(scope, sessionId, put, canCommit);
    else await cache.put(sessionId, put, canCommit);
  }

  function schedule(sessionId: string): void {
    if (disposed) return;
    const existing = timers.get(sessionId);
    if (existing) clearTimeout(existing);
    timers.set(
      sessionId,
      setTimeout(() => {
        timers.delete(sessionId);
        void flush(sessionId);
      }, debounceMs),
    );
  }

  function record(sessionId: string, events: CachedEvent[]): void {
    if (disposed || events.length === 0) return;
    const buf = buffers.get(sessionId) ?? [];
    let max = maxSeqOf(buf);
    for (const e of events) {
      if (e.seq > max) {
        buf.push(e);
        max = e.seq;
      }
    }
    buffers.set(sessionId, buf);
    schedule(sessionId);
  }

  function seed(sessionId: string, events: CachedEvent[]): void {
    if (disposed) return;
    buffers.set(sessionId, [...events]);
    schedule(sessionId);
  }

  function merge(sessionId: string, events: CachedEvent[]): CachedEvent[] {
    if (disposed) return snapshot(sessionId);
    if (events.length === 0) return snapshot(sessionId);
    const bySeq = new Map<number, CachedEvent>();
    for (const e of buffers.get(sessionId) ?? []) bySeq.set(e.seq, e);
    for (const e of events) bySeq.set(e.seq, e);
    const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
    buffers.set(sessionId, merged);
    schedule(sessionId);
    return merged;
  }

  function snapshot(sessionId: string): CachedEvent[] {
    if (disposed) return [];
    return [...(buffers.get(sessionId) ?? [])];
  }

  async function drop(sessionId: string): Promise<void> {
    if (disposed) return;
    clearTimer(sessionId);
    buffers.delete(sessionId);
    if (scope) await cache.deleteScoped(scope, sessionId);
    else await cache.delete(sessionId);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    flushGeneration += 1;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    buffers.clear();
  }

  return { record, seed, merge, snapshot, drop, flush, dispose };
}
