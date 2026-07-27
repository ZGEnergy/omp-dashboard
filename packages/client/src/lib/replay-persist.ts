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
import type { SkippedSeqRange } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { computeLogicalSeqBounds, normalizeSkippedSeqRanges, retainSkippedSeqRangesForEventSuffix } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { type CachedEvent, DEFAULT_MAX_BYTES_PER_SESSION, type ReplayCache, type ReplayCacheScope, replayCache } from "./replay-cache.js";

export interface ReplayPersister {
  /** Append events (dedup by seq) and schedule a debounced persist. */
  record(sessionId: string, events: CachedEvent[], skippedSeqRanges?: SkippedSeqRange[]): void;
  /** Replace the buffer wholesale (rehydrate seeding / replay reset). */
  seed(sessionId: string, events: CachedEvent[], skippedSeqRanges?: SkippedSeqRange[]): void;
  /** Clear buffer + delete the persisted entry (invalidation). Awaitable so a
   *  fast reload/close after session_state_reset can't race a surviving entry. */
  drop(sessionId: string): Promise<void>;
  /** Force an immediate flush (tests / unmount). */
  flush(sessionId: string): Promise<void>;
  /** Merge newly-arrived older events into the buffer (dedup by seq), returning the merged snapshot. See change: session-tail-rehydrate. */
  merge(sessionId: string, events: CachedEvent[], skippedSeqRanges?: SkippedSeqRange[]): CachedEvent[];
  /** Return a defensive copy of the current raw-event buffer. See change: session-tail-rehydrate. */
  snapshot(sessionId: string): CachedEvent[];
  /** Invalidate every pending timer + buffer without deleting committed cache
   *  state. After dispose, record/seed/merge/flush/drop are inert no-ops (no
   *  timers fire, no writes commit) and snapshot returns []. */
  dispose(): void;
  /** Estimated UTF-8 bytes retained in this session's buffer (0 when absent/disposed). */
  bytes(sessionId: string): number;
}

export function createReplayPersister(
  cache: ReplayCache = replayCache,
  debounceMs = 1000,
  scope?: ReplayCacheScope,
  maxRetainedBytes = DEFAULT_MAX_BYTES_PER_SESSION,
): ReplayPersister {
  interface ReplayBuffer {
    events: CachedEvent[];
    skippedSeqRanges: SkippedSeqRange[];
    head: number;
    bytes: number;
    maxSeq: number;
    minSeq?: number;
  }
  function snapshotBuffer(buffer?: ReplayBuffer): CachedEvent[] {
    return buffer ? buffer.events.slice(buffer.head) : [];
  }
  const buffers = new Map<string, ReplayBuffer>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const encoder = new TextEncoder();
  let disposed = false;
  let flushGeneration = 0;

  function eventBytes(event: CachedEvent): number {
    return encoder.encode(JSON.stringify(event)).byteLength;
  }

  function calcBufferBytes(events: CachedEvent[], ranges: SkippedSeqRange[] = []): number {
    let b = 0;
    for (const e of events) b += eventBytes(e);
    if (ranges.length > 0) b += encoder.encode(JSON.stringify(ranges)).byteLength;
    return b;
  }

  function retainNewest(events: CachedEvent[], skippedSeqRanges: SkippedSeqRange[] = []): ReplayBuffer {
    const normRanges = normalizeSkippedSeqRanges(skippedSeqRanges);
    let head = 0;
    let retained = events.slice(head);
    let keptRanges = retainSkippedSeqRangesForEventSuffix(retained, normRanges);
    let bytes = calcBufferBytes(retained, keptRanges);

    while (head < events.length - 1 && bytes > maxRetainedBytes) {
      head += 1;
      retained = events.slice(head);
      keptRanges = retainSkippedSeqRangesForEventSuffix(retained, normRanges);
      bytes = calcBufferBytes(retained, keptRanges);
    }

    const fullBounds = computeLogicalSeqBounds(retained, keptRanges);

    return {
      events: retained,
      skippedSeqRanges: keptRanges,
      head: 0,
      bytes,
      maxSeq: fullBounds.maxSeq ?? (retained.at(-1)?.seq ?? 0),
      minSeq: fullBounds.minSeq ?? (retained.at(0)?.seq ?? undefined),
    };
  }

  function trimHead(buffer: ReplayBuffer): void {
    const norm = normalizeSkippedSeqRanges(buffer.skippedSeqRanges);
    let events = buffer.events.slice(buffer.head);
    let keptRanges = retainSkippedSeqRangesForEventSuffix(events, norm);
    let bytes = calcBufferBytes(events, keptRanges);

    while (events.length > 1 && bytes > maxRetainedBytes) {
      events = events.slice(1);
      keptRanges = retainSkippedSeqRangesForEventSuffix(events, norm);
      bytes = calcBufferBytes(events, keptRanges);
    }

    const fullBounds = computeLogicalSeqBounds(events, keptRanges);

    buffer.events = events;
    buffer.head = 0;
    buffer.skippedSeqRanges = keptRanges;
    buffer.maxSeq = fullBounds.maxSeq ?? buffer.maxSeq;
    buffer.minSeq = fullBounds.minSeq ?? buffer.minSeq;
    buffer.bytes = bytes;
  }

  function clearTimer(sessionId: string): void {
    const timer = timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(sessionId);
    }
  }

  async function flush(sessionId: string): Promise<void> {
    if (disposed) return;
    const generation = flushGeneration;
    clearTimer(sessionId);
    const buffer = buffers.get(sessionId);
    if (!buffer || (buffer.events.length === buffer.head && buffer.skippedSeqRanges.length === 0)) return;
    const put = {
      maxSeq: buffer.maxSeq,
      minSeq: buffer.minSeq,
      payload: snapshotBuffer(buffer),
      skippedSeqRanges: buffer.skippedSeqRanges.length > 0 ? buffer.skippedSeqRanges : undefined,
    };
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

  function record(sessionId: string, events: CachedEvent[], skippedSeqRanges: SkippedSeqRange[] = []): void {
    if (disposed || (events.length === 0 && skippedSeqRanges.length === 0)) return;
    const buffer = buffers.get(sessionId) ?? { events: [], skippedSeqRanges: [], head: 0, bytes: 0, maxSeq: 0 };
    const currentEvents = snapshotBuffer(buffer);
    for (const event of events) {
      if (event.seq <= buffer.maxSeq && currentEvents.some((e) => e.seq === event.seq)) continue;
      currentEvents.push(event);
    }
    buffer.events = currentEvents;
    buffer.head = 0;
    if (skippedSeqRanges.length > 0) {
      buffer.skippedSeqRanges = normalizeSkippedSeqRanges([...buffer.skippedSeqRanges, ...skippedSeqRanges]);
    }
    trimHead(buffer);
    buffers.set(sessionId, buffer);
    schedule(sessionId);
  }

  function seed(sessionId: string, events: CachedEvent[], skippedSeqRanges: SkippedSeqRange[] = []): void {
    if (disposed) return;
    buffers.set(sessionId, retainNewest([...events], skippedSeqRanges));
    schedule(sessionId);
  }

  function merge(sessionId: string, events: CachedEvent[], skippedSeqRanges: SkippedSeqRange[] = []): CachedEvent[] {
    if (disposed) return snapshot(sessionId);
    if (events.length === 0 && skippedSeqRanges.length === 0) return snapshot(sessionId);
    const existingBuffer = buffers.get(sessionId);
    const bySeq = new Map<number, CachedEvent>();
    for (const event of snapshotBuffer(existingBuffer)) bySeq.set(event.seq, event);
    for (const event of events) bySeq.set(event.seq, event);
    const mergedRanges = normalizeSkippedSeqRanges([...(existingBuffer?.skippedSeqRanges ?? []), ...skippedSeqRanges]);
    const buffer = retainNewest([...bySeq.values()].sort((a, b) => a.seq - b.seq), mergedRanges);
    buffers.set(sessionId, buffer);
    schedule(sessionId);
    return snapshotBuffer(buffer);
  }


  function snapshot(sessionId: string): CachedEvent[] {
    if (disposed) return [];
    return snapshotBuffer(buffers.get(sessionId));
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
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    buffers.clear();
  }

  function bytes(sessionId: string): number {
    if (disposed) return 0;
    return buffers.get(sessionId)?.bytes ?? 0;
  }

  return { record, seed, merge, snapshot, drop, flush, dispose, bytes };
}
