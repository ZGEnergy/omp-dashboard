import { prepareEventForReplay, utf8ByteLength, type PrepareEventForReplayOptions } from "./prepare-event-for-replay.js";
import type { DashboardEvent } from "./types.js";

/** Default wire/IDB tail budget (~1.5 MiB). */
export const DEFAULT_TAIL_WINDOW_BYTES = 1.5 * 1024 * 1024;

/** Server clamp for client-supplied windowBytes. */
export const MIN_TAIL_WINDOW_BYTES = 256 * 1024;
export const MAX_TAIL_WINDOW_BYTES = 8 * 1024 * 1024;

/** Minimal event-like shape; both store and wire use `{ seq, event }`. */
export interface SeqEvent<T = DashboardEvent> {
  seq: number;
  event: T;
}

export type EventWindowPreparationOptions = Pick<PrepareEventForReplayOptions, "registerInlineAsset" | "maxEventBytes">;

export interface EventWindowResult<T> {
  /** Selected events in ascending seq order. */
  events: SeqEvent<T>[];
  /** True when the input had older events not included. */
  hasMoreOlder: boolean;
  /** True when the first selected event is not a complete user-turn boundary. */
  partialHead: boolean;
  /** Lowest seq in `events`, or null if empty. */
  windowMinSeq: number | null;
  /** Highest seq in `events`, or null if empty. */
  windowMaxSeq: number | null;
  /** Actual UTF-8 size of selected event envelopes. */
  bytes: number;
  /** True when the supplied source is not strictly ascending and contiguous. */
  sourceMalformed?: true;
}

/** Clamp a requested budget into the allowed range. Non-finite / missing → default. */
export function clampTailWindowBytes(requested?: number): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_TAIL_WINDOW_BYTES;
  }
  return Math.min(MAX_TAIL_WINDOW_BYTES, Math.max(MIN_TAIL_WINDOW_BYTES, Math.floor(requested)));
}

/** Actual UTF-8 wire size of one `{seq,event}` envelope. */
export function estimateSeqEventBytes(entry: SeqEvent): number {
  try {
    const serialized = JSON.stringify(entry);
    return typeof serialized === "string" ? utf8ByteLength(serialized) : 0;
  } catch {
    // Invalid source is rejected by the window selectors; keep this utility
    // nonthrowing for callers inspecting untrusted store records directly.
    return Number.MAX_SAFE_INTEGER;
  }
}

function isUserTurnStart(entry: SeqEvent<DashboardEvent>): boolean {
  try {
    if (entry.event.eventType !== "message_start") return false;
    const data = entry.event.data;
    if (data.role === "user") return true;
    const message = data.message;
    return !!message && typeof message === "object" && (message as { role?: unknown }).role === "user";
  } catch {
    return false;
  }
}

function isDashboardEvent(value: unknown): value is DashboardEvent {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const event = value as Record<string, unknown>;
    return typeof event.eventType === "string" &&
      typeof event.timestamp === "number" && Number.isFinite(event.timestamp) &&
      !!event.data && typeof event.data === "object" && !Array.isArray(event.data);
  } catch {
    return false;
  }
}

function snapshotContiguousAscending(events: unknown): SeqEvent<DashboardEvent>[] | null {
  if (!Array.isArray(events)) return null;
  const snapshot: SeqEvent<DashboardEvent>[] = [];
  let previousSeq: number | undefined;
  try {
    for (const entry of events) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as unknown as Record<string, unknown>;
      const seq = record.seq;
      const event = record.event;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq) || !isDashboardEvent(event)) return null;
      if (previousSeq !== undefined && seq !== previousSeq + 1) return null;
      snapshot.push({ seq, event });
      previousSeq = seq;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function eventEnvelopeOverhead(seq: number): number {
  const envelopeWithNull = utf8ByteLength(JSON.stringify({ seq, event: null }));
  return envelopeWithNull - utf8ByteLength("null");
}

// A single event can never exceed one replay frame even when the selection
// spans many frames; callers pass the frame budget so oversized events are
// accounted (and truncated) at their delivered size, not their raw size.
function computePerEventCap(budgetBytes: number, maxEventBytes?: number): number {
  return maxEventBytes != null && Number.isFinite(maxEventBytes) && maxEventBytes > 0
    ? Math.min(budgetBytes, Math.floor(maxEventBytes))
    : budgetBytes;
}

// Prepare one entry against a fixed per-event cap. Preparation is per-event
// independent (its only inputs are the event, the constant cap, and the seq
// overhead), so preparing an entry inside a suffix yields the byte-identical
// result it would have inside the full source — this is what lets the window
// selector prepare only the chosen suffix instead of the whole source.
function prepareSingleEntry(
  entry: SeqEvent<DashboardEvent>,
  perEventCap: number,
  options: EventWindowPreparationOptions,
): { prepared: SeqEvent<DashboardEvent>; truncated: boolean } {
  const maxEventBytes = Math.max(1, perEventCap - eventEnvelopeOverhead(entry.seq));
  const prepared = prepareEventForReplay(entry.event, {
    maxEventBytes,
    maxTextBytes: maxEventBytes,
    registerInlineAsset: options.registerInlineAsset,
  });
  const truncated = prepared.issues.some((issue) => issue.code === "event_truncated");
  return { prepared: { seq: entry.seq, event: prepared.event }, truncated };
}

function prepareEntries(
  eventsAsc: readonly SeqEvent<DashboardEvent>[],
  budgetBytes: number,
  options: EventWindowPreparationOptions = {},
): { events: SeqEvent<DashboardEvent>[]; truncatedSeqs: Set<number> } {
  const perEventCap = computePerEventCap(budgetBytes, options.maxEventBytes);
  const truncatedSeqs = new Set<number>();
  const events = eventsAsc.map((entry) => {
    const { prepared, truncated } = prepareSingleEntry(entry, perEventCap, options);
    if (truncated) truncatedSeqs.add(entry.seq);
    return prepared;
  });
  return { events, truncatedSeqs };
}

function sumSeqEventBytes(
  entries: readonly SeqEvent<DashboardEvent>[],
  from: number,
  to: number,
): number {
  let total = 0;
  for (let index = from; index < to; index += 1) {
    total += estimateSeqEventBytes(entries[index]!);
  }
  return total;
}

// Does a user-turn boundary survive preparation somewhere strictly before the
// bounded suffix? Turn-start-ness is decided on *prepared* events (an oversized
// `message_start` can be wiped by the per-event cap), so raw `message_start`
// user entries are only candidates — each is prepared and re-checked, newest
// first, stopping at the first survivor. Raw scanning is O(source) but cheap;
// preparation runs only on candidates until one survives, so it stays bounded.
function hasPreparedTurnStartBelow(
  source: readonly SeqEvent<DashboardEvent>[],
  suffixStart: number,
  perEventCap: number,
): boolean {
  for (let index = suffixStart - 1; index >= 0; index -= 1) {
    if (!isUserTurnStart(source[index]!)) continue;
    const { prepared } = prepareSingleEntry(source[index]!, perEventCap, {});
    if (isUserTurnStart(prepared)) return true;
  }
  return false;
}

function emptyWindow<T>(): EventWindowResult<T> {
  return {
    events: [],
    hasMoreOlder: false,
    partialHead: false,
    windowMinSeq: null,
    windowMaxSeq: null,
    bytes: 0,
  };
}

function malformedWindow<T>(): EventWindowResult<T> {
  return { ...emptyWindow<T>(), sourceMalformed: true };
}

function resultFromSelection<T>(
  sourceLength: number,
  selected: SeqEvent<T>[],
  bytes: number,
  partialHead: boolean,
): EventWindowResult<T> {
  return {
    events: selected,
    hasMoreOlder: selected.length < sourceLength,
    partialHead,
    windowMinSeq: selected[0]?.seq ?? null,
    windowMaxSeq: selected.at(-1)?.seq ?? null,
    bytes,
  };
}

function selectionContainsTruncation(
  selected: readonly SeqEvent[],
  truncatedSeqs: ReadonlySet<number>,
): boolean {
  return selected.some((entry) => truncatedSeqs.has(entry.seq));
}

function compactPreparedSelection(
  entries: readonly SeqEvent<DashboardEvent>[],
  budget: number,
): { events: SeqEvent<DashboardEvent>[]; bytes: number; truncated: boolean } {
  const compacted: SeqEvent<DashboardEvent>[] = [];
  let remaining = budget;
  let truncated = false;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const remainingCount = entries.length - index;
    const targetEnvelopeBytes = Math.max(1, Math.floor(remaining / remainingCount));
    const maxEventBytes = Math.max(1, targetEnvelopeBytes - eventEnvelopeOverhead(entry.seq));
    const prepared = prepareEventForReplay(entry.event, {
      maxEventBytes,
      maxTextBytes: maxEventBytes,
    });
    truncated ||= prepared.issues.some((issue) => issue.code === "event_truncated");
    const compactedEntry = { seq: entry.seq, event: prepared.event };
    compacted.push(compactedEntry);
    remaining -= estimateSeqEventBytes(compactedEntry);
  }

  let bytes = compacted.reduce((total, entry) => total + estimateSeqEventBytes(entry), 0);
  if (bytes > budget) {
    const minimal = compacted.map((entry) => ({
      seq: entry.seq,
      event: { eventType: "unknown", timestamp: 0, data: {} },
    }));
    const minimalBytes = minimal.reduce((total, entry) => total + estimateSeqEventBytes(entry), 0);
    if (minimalBytes <= budget) {
      return { events: minimal, bytes: minimalBytes, truncated: true };
    }
  }
  return { events: compacted, bytes, truncated };
}

function finalizeSelectedEntries(
  source: readonly SeqEvent<DashboardEvent>[],
  selected: SeqEvent<DashboardEvent>[],
  bytes: number,
  partialHead: boolean,
  budget: number,
  options: EventWindowPreparationOptions,
): EventWindowResult<DashboardEvent> {
  if (!options.registerInlineAsset) {
    return resultFromSelection(source.length, selected, bytes, partialHead);
  }

  const sourceBySeq = new Map(source.map((entry) => [entry.seq, entry]));
  const selectedSource = selected.map((entry) => sourceBySeq.get(entry.seq)!);
  const prepared = prepareEntries(selectedSource, budget, options);
  const preparedBytes = prepared.events.reduce((total, entry) => total + estimateSeqEventBytes(entry), 0);
  if (preparedBytes <= budget) {
    return resultFromSelection(
      source.length,
      prepared.events,
      preparedBytes,
      partialHead || selectionContainsTruncation(prepared.events, prepared.truncatedSeqs),
    );
  }

  // Registration is deliberately the final selection-independent step: once an
  // asset is registered, keep its event in the delivery set and compact payload
  // strings instead of shrinking the set and orphaning the registration.
  const compacted = compactPreparedSelection(prepared.events, budget);
  return resultFromSelection(
    source.length,
    compacted.events,
    compacted.bytes,
    partialHead || compacted.truncated || selectionContainsTruncation(compacted.events, prepared.truncatedSeqs),
  );
}

/**
 * Prepare and select the newest complete user turns that fit the UTF-8 budget.
 * If the newest turn alone is too large, return its newest bounded contiguous
 * suffix and mark `partialHead`.
 */
export function selectNewestEventsByBudget(
  eventsAsc: readonly SeqEvent<DashboardEvent>[],
  budgetBytes: number = DEFAULT_TAIL_WINDOW_BYTES,
  options: EventWindowPreparationOptions = {},
): EventWindowResult<DashboardEvent> {
  const budget = Number.isFinite(budgetBytes) && budgetBytes > 0
    ? Math.floor(budgetBytes)
    : DEFAULT_TAIL_WINDOW_BYTES;
  const source = snapshotContiguousAscending(eventsAsc);
  if (source === null) return malformedWindow();
  if (source.length === 0) return emptyWindow();

  const perEventCap = computePerEventCap(budget, options.maxEventBytes);

  // Window BEFORE preparing: prepare only the newest bounded suffix, walking
  // from the tail until adding one more prepared event would exceed the budget.
  // This is exactly the bounded contiguous suffix a full-source prepare +
  // `selectBoundedSuffix` would yield, but preparation is O(window), not
  // O(source). The whole selection (including turn extension) always fits the
  // budget, so every event it can pick lives inside this suffix.
  const truncatedSeqs = new Set<number>();
  const suffixDescending: SeqEvent<DashboardEvent>[] = [];
  let suffixStart = source.length;
  let suffixBytes = 0;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const { prepared, truncated } = prepareSingleEntry(source[index]!, perEventCap, {});
    const size = estimateSeqEventBytes(prepared);
    if (suffixBytes + size > budget) break;
    if (truncated) truncatedSeqs.add(prepared.seq);
    suffixStart = index;
    suffixBytes += size;
    suffixDescending.push(prepared);
  }
  const suffix = suffixDescending.slice().reverse();

  // Turn starts detected on the PREPARED suffix (absolute source indices).
  const turnStartsAbs: number[] = [];
  for (let position = 0; position < suffix.length; position += 1) {
    if (isUserTurnStart(suffix[position]!)) turnStartsAbs.push(suffixStart + position);
  }

  // No user-turn boundary inside the budget window. The bounded suffix is the
  // result; `partialHead` distinguishes "an older user turn exists off-window"
  // (the newest turn is farther back than the budget — original
  // `selectedBytes > budget` branch → true) from "no user turn exists at all"
  // (original `turnStarts.length === 0` branch → false).
  if (turnStartsAbs.length === 0) {
    const partialHead = hasPreparedTurnStartBelow(source, suffixStart, perEventCap);
    return finalizeSelectedEntries(source, suffix, suffixBytes, partialHead, budget, options);
  }

  // A user-turn boundary lives inside the bounded suffix, so its bytes fit the
  // budget: always extend turn-by-turn toward older complete turns while they
  // fit. Positions are relative to the suffix (absoluteIndex - suffixStart).
  let selectedStart = turnStartsAbs.at(-1)!;
  let selectedBytes = sumSeqEventBytes(suffix, selectedStart - suffixStart, suffix.length);
  for (let turn = turnStartsAbs.length - 2; turn >= 0; turn -= 1) {
    const candidateStart = turnStartsAbs[turn]!;
    const candidateBytes = sumSeqEventBytes(
      suffix,
      candidateStart - suffixStart,
      selectedStart - suffixStart,
    );
    if (selectedBytes + candidateBytes > budget) break;
    selectedStart = candidateStart;
    selectedBytes += candidateBytes;
  }

  const selected = suffix.slice(selectedStart - suffixStart);
  return finalizeSelectedEntries(
    source,
    selected,
    selectedBytes,
    selectionContainsTruncation(selected, truncatedSeqs),
    budget,
    options,
  );
}

/** Select the newest semantic page strictly below the exclusive `fromSeq`. */
export function selectOlderEventsByBudget(
  eventsAsc: readonly SeqEvent<DashboardEvent>[],
  fromSeq: number,
  budgetBytes: number = DEFAULT_TAIL_WINDOW_BYTES,
  options: EventWindowPreparationOptions = {},
): EventWindowResult<DashboardEvent> {
  if (!Number.isSafeInteger(fromSeq)) return malformedWindow();
  const source = snapshotContiguousAscending(eventsAsc);
  if (source === null) return malformedWindow();
  try {
    const older = source.filter((entry) => entry.seq < fromSeq);
    return selectNewestEventsByBudget(older, budgetBytes, options);
  } catch {
    return malformedWindow();
  }
}
