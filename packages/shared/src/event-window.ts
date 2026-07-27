import type { SkippedSeqRange } from "./browser-protocol.js";
import { type PrepareEventForReplayOptions, prepareEventForReplay, utf8ByteLength } from "./prepare-event-for-replay.js";
import { clipSkippedSeqRanges, computeLogicalSeqBounds, isCoverageContiguous, normalizeSkippedSeqRanges, projectReplayEvents, retainSkippedSeqRangesForEventSuffix } from "./replay-projection.js";
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

export type EventWindowPreparationOptions = Pick<
  PrepareEventForReplayOptions,
  "registerInlineAsset" | "maxEventBytes" | "maxToolPayloadBytes"
> & { skippedSeqRanges?: readonly SkippedSeqRange[] };

export interface EventWindowResult<T> {
  /** Selected events in ascending seq order. */
  events: SeqEvent<T>[];
  /** Skipped sequence ranges within the window coverage. */
  skippedSeqRanges?: SkippedSeqRange[];
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

function snapshotSparseAscending(events: unknown): SeqEvent<DashboardEvent>[] | null {
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
      if (previousSeq !== undefined && seq <= previousSeq) return null;
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
  const clonedEvent = entry.event ? structuredClone(entry.event) : entry.event;
  const prepared = prepareEventForReplay(clonedEvent, {
    maxEventBytes,
    maxTextBytes: maxEventBytes,
    registerInlineAsset: options.registerInlineAsset,
    maxToolPayloadBytes: options.maxToolPayloadBytes,
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
  options: EventWindowPreparationOptions = {},
): boolean {
  for (let index = suffixStart - 1; index >= 0; index -= 1) {
    if (!isUserTurnStart(source[index]!)) continue;
    const { prepared } = prepareSingleEntry(source[index]!, perEventCap, { maxToolPayloadBytes: options.maxToolPayloadBytes });
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
  hasMoreOlderOverride?: boolean,
  windowMinSeqOverride?: number | null,
  windowMaxSeqOverride?: number | null,
): EventWindowResult<T> {
  return {
    events: selected,
    hasMoreOlder: hasMoreOlderOverride ?? (selected.length < sourceLength),
    partialHead,
    windowMinSeq: windowMinSeqOverride !== undefined ? windowMinSeqOverride : (selected[0]?.seq ?? null),
    windowMaxSeq: windowMaxSeqOverride !== undefined ? windowMaxSeqOverride : (selected.at(-1)?.seq ?? null),
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

  const bytes = compacted.reduce((total, entry) => total + estimateSeqEventBytes(entry), 0);
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
  hasMoreOlderOverride?: boolean,
  windowMinSeqOverride?: number | null,
  windowMaxSeqOverride?: number | null,
): EventWindowResult<DashboardEvent> {
  if (!options.registerInlineAsset) {
    return resultFromSelection(source.length, selected, bytes, partialHead, hasMoreOlderOverride, windowMinSeqOverride, windowMaxSeqOverride);
  }
  const sourceBySeq = new Map(source.map((entry) => [entry.seq, entry]));
  const selectedRawSource = selected.map((entry) => sourceBySeq.get(entry.seq) || entry);
  const prepared = prepareEntries(selectedRawSource, budget, options);
  const compacted = compactPreparedSelection(prepared.events, budget);
  return resultFromSelection(
    source.length,
    compacted.events,
    compacted.bytes,
    partialHead || compacted.truncated || selectionContainsTruncation(compacted.events, prepared.truncatedSeqs),
    hasMoreOlderOverride,
    windowMinSeqOverride,
    windowMaxSeqOverride,
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

  const userRanges = options.skippedSeqRanges ?? (options as any).ranges;
  let rawSource: SeqEvent<DashboardEvent>[] | null;

  if (!userRanges || userRanges.length === 0) {
    rawSource = snapshotContiguousAscending(eventsAsc);
    if (rawSource === null) return malformedWindow();
  } else {
    rawSource = snapshotSparseAscending(eventsAsc);
    if (rawSource === null) return malformedWindow();
    if (rawSource.length > 0) {
      const minSeq = rawSource[0]!.seq;
      const maxSeq = rawSource.at(-1)!.seq;
      if (!isCoverageContiguous(rawSource, userRanges, minSeq, maxSeq)) {
        return malformedWindow();
      }
    }
  }

  if (rawSource.length === 0) return emptyWindow();

  const projection = projectReplayEvents(rawSource);
  const source = projection.events;
  const allSkippedRanges = normalizeSkippedSeqRanges([...(userRanges ?? []), ...projection.skippedSeqRanges]);

  if (source.length === 0) {
    return emptyWindow();
  }

  const perEventCap = computePerEventCap(budget, options.maxEventBytes);

  let newestUserIdx = -1;
  for (let i = source.length - 1; i >= 0; i -= 1) {
    if (isUserTurnStart(source[i]!)) {
      newestUserIdx = i;
      break;
    }
  }

  const scanOptions: EventWindowPreparationOptions = {
    maxEventBytes: options.maxEventBytes,
    maxToolPayloadBytes: options.maxToolPayloadBytes,
    registerInlineAsset: undefined,
  };

  const toolCapCandidates = options.maxToolPayloadBytes !== undefined
    ? [options.maxToolPayloadBytes, 10 * 1024, 4 * 1024, 2 * 1024, 1 * 1024]
    : [undefined];

  let chosenSuffix: SeqEvent<DashboardEvent>[] = [];
  let chosenTruncatedSeqs = new Set<number>();
  let chosenSuffixStart = source.length;
  let chosenSuffixEventBytes = 0;

  for (const toolCap of toolCapCandidates) {
    const truncatedSeqs = new Set<number>();
    const currentSuffixDescending: SeqEvent<DashboardEvent>[] = [];
    let currentBytes = 0;
    let validSuffixDescending: SeqEvent<DashboardEvent>[] = [];
    let validSuffixStart = source.length;
    let validSuffixBytes = 0;

    for (let index = source.length - 1; index >= 0; index -= 1) {
      const { prepared, truncated } = prepareSingleEntry(source[index]!, perEventCap, {
        ...scanOptions,
        maxToolPayloadBytes: toolCap,
      });
      const size = estimateSeqEventBytes(prepared);

      if (currentBytes + size > budget) break;

      if (truncated) truncatedSeqs.add(prepared.seq);
      currentBytes += size;
      currentSuffixDescending.push(truncated ? prepared : source[index]!);

      const isTurnBoundary = isUserTurnStart(source[index]!) || index === 0;
      if (newestUserIdx === -1 || isTurnBoundary || index >= newestUserIdx) {
        validSuffixDescending = [...currentSuffixDescending];
        validSuffixStart = index;
        validSuffixBytes = currentBytes;
      }
    }

    chosenSuffix = validSuffixDescending.reverse();
    chosenTruncatedSeqs = truncatedSeqs;
    chosenSuffixStart = validSuffixStart;
    chosenSuffixEventBytes = validSuffixBytes;

    if (newestUserIdx === -1 || chosenSuffixStart <= newestUserIdx) {
      break;
    }
  }

  const suffix = chosenSuffix;
  const suffixStart = chosenSuffixStart;

  let windowSkippedRanges = retainSkippedSeqRangesForEventSuffix(suffix, allSkippedRanges);
  let totalSkippedMetaBytes = windowSkippedRanges.length > 0 ? utf8ByteLength(JSON.stringify(windowSkippedRanges)) : 0;
  let totalBytes = chosenSuffixEventBytes + totalSkippedMetaBytes;

  while (suffix.length > 0 && totalBytes > budget) {
    const dropped = suffix.shift()!;
    chosenSuffixStart += 1;
    chosenSuffixEventBytes -= estimateSeqEventBytes(dropped);
    windowSkippedRanges = retainSkippedSeqRangesForEventSuffix(suffix, allSkippedRanges);
    totalSkippedMetaBytes = windowSkippedRanges.length > 0 ? utf8ByteLength(JSON.stringify(windowSkippedRanges)) : 0;
    totalBytes = chosenSuffixEventBytes + totalSkippedMetaBytes;
  }

  const { minSeq: logicalMinSeq, maxSeq: logicalMaxSeq } = computeLogicalSeqBounds(suffix, windowSkippedRanges);

  const hasMoreOlderCalc = chosenSuffixStart > 0 || Boolean(logicalMinSeq !== null && allSkippedRanges.some((r) => r.fromSeq < logicalMinSeq));
  const partialHeadCalc = chosenTruncatedSeqs.has(suffix[0]?.seq ?? -1)
    || (suffix.length > 0 && !isUserTurnStart(suffix[0]!) && hasPreparedTurnStartBelow(source, chosenSuffixStart, perEventCap, scanOptions));

  const finalResult = finalizeSelectedEntries(
    rawSource,
    suffix,
    totalBytes,
    partialHeadCalc,
    budget,
    options,
    hasMoreOlderCalc,
    logicalMinSeq,
    logicalMaxSeq,
  );
  return {
    ...finalResult,
    skippedSeqRanges: windowSkippedRanges.length > 0 ? windowSkippedRanges : undefined,
  };
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
