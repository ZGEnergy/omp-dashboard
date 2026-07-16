/**
 * Newest-first byte-budget windowing for session event tails.
 *
 * Used by:
 * - client IndexedDB replay cache (trim-on-put for large sessions)
 * - server subscribe `mode: "tail"` / load-older (`fromSeq`) paths
 *
 * See change: session-tail-rehydrate.
 */

/** Default wire/IDB tail budget (~4 MiB). */
export const DEFAULT_TAIL_WINDOW_BYTES = 4 * 1024 * 1024;

/** Server clamp for client-supplied windowBytes. */
export const MIN_TAIL_WINDOW_BYTES = 256 * 1024;
export const MAX_TAIL_WINDOW_BYTES = 8 * 1024 * 1024;

/** Minimal event-like shape; both store and wire use `{ seq, event }`. */
export interface SeqEvent<T = unknown> {
  seq: number;
  event: T;
}

export interface EventWindowResult<T> {
  /** Selected events in ascending seq order. */
  events: SeqEvent<T>[];
  /** True when the input had older events not included. */
  hasMoreOlder: boolean;
  /** Lowest seq in `events`, or 0 if empty. */
  windowMinSeq: number;
  /** Highest seq in `events`, or 0 if empty. */
  windowMaxSeq: number;
  /** Serialized size of the selected payload (sum of per-event sizes). */
  bytes: number;
}

/**
 * Clamp a requested budget into the allowed range. Non-finite / missing → default.
 * Use at untrusted API boundaries (subscribe.windowBytes). Pure selectors do not clamp.
 */
export function clampTailWindowBytes(requested?: number): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_TAIL_WINDOW_BYTES;
  }
  return Math.min(MAX_TAIL_WINDOW_BYTES, Math.max(MIN_TAIL_WINDOW_BYTES, Math.floor(requested)));
}

/**
 * Stable size estimate matching IndexedDB put's historical
 * `JSON.stringify(payload).length` accounting: per-event
 * `JSON.stringify({ seq, event }).length`.
 */
export function estimateSeqEventBytes(entry: SeqEvent): number {
  return JSON.stringify(entry).length;
}

/**
 * Select the newest events from an ascending-seq list that fit `budgetBytes`.
 *
 * - Walks newest → oldest.
 * - Never splits an event.
 * - Always keeps at least the newest event when the list is non-empty (even if
 *   that single event exceeds the budget).
 * - Returns events in ascending seq order.
 * - Does NOT clamp budget (call `clampTailWindowBytes` at API edges).
 */
export function selectNewestEventsByBudget<T>(
  eventsAsc: readonly SeqEvent<T>[],
  budgetBytes: number = DEFAULT_TAIL_WINDOW_BYTES,
): EventWindowResult<T> {
  const budget =
    Number.isFinite(budgetBytes) && budgetBytes > 0
      ? Math.floor(budgetBytes)
      : DEFAULT_TAIL_WINDOW_BYTES;

  if (eventsAsc.length === 0) {
    return { events: [], hasMoreOlder: false, windowMinSeq: 0, windowMaxSeq: 0, bytes: 0 };
  }

  const picked: SeqEvent<T>[] = [];
  let bytes = 0;

  for (let i = eventsAsc.length - 1; i >= 0; i--) {
    const entry = eventsAsc[i]!;
    const size = estimateSeqEventBytes(entry);
    if (picked.length > 0 && bytes + size > budget) break;
    picked.push(entry);
    bytes += size;
  }

  // picked is newest-first; reverse to ascending seq.
  picked.reverse();

  const hasMoreOlder = picked.length < eventsAsc.length;
  const windowMinSeq = picked[0]?.seq ?? 0;
  const windowMaxSeq = picked[picked.length - 1]?.seq ?? 0;

  return { events: picked, hasMoreOlder, windowMinSeq, windowMaxSeq, bytes };
}

/**
 * Select an older page: newest events with `seq < fromSeq` under the budget.
 * `eventsAsc` must be the full ascending buffer (or the prefix older than live tail).
 */
export function selectOlderEventsByBudget<T>(
  eventsAsc: readonly SeqEvent<T>[],
  fromSeq: number,
  budgetBytes: number = DEFAULT_TAIL_WINDOW_BYTES,
): EventWindowResult<T> {
  const older = eventsAsc.filter((e) => e.seq < fromSeq);
  return selectNewestEventsByBudget(older, budgetBytes);
}
