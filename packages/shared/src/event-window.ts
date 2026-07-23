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

function prepareEntries(
  eventsAsc: readonly SeqEvent<DashboardEvent>[],
  budgetBytes: number,
  options: EventWindowPreparationOptions = {},
): { events: SeqEvent<DashboardEvent>[]; truncatedSeqs: Set<number> } {
  // A single event can never exceed one replay frame even when the selection
  // spans many frames; callers pass the frame budget so oversized events are
  // accounted (and truncated) at their delivered size, not their raw size.
  const perEventCap = options.maxEventBytes != null && Number.isFinite(options.maxEventBytes) && options.maxEventBytes > 0
    ? Math.min(budgetBytes, Math.floor(options.maxEventBytes))
    : budgetBytes;
  const truncatedSeqs = new Set<number>();
  const events = eventsAsc.map((entry) => {
    const maxEventBytes = Math.max(1, perEventCap - eventEnvelopeOverhead(entry.seq));
    const prepared = prepareEventForReplay(entry.event, {
      maxEventBytes,
      maxTextBytes: maxEventBytes,
      registerInlineAsset: options.registerInlineAsset,
    });
    if (prepared.issues.some((issue) => issue.code === "event_truncated")) {
      truncatedSeqs.add(entry.seq);
    }
    return { seq: entry.seq, event: prepared.event };
  });
  return { events, truncatedSeqs };
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

function selectBoundedSuffix(
  source: readonly SeqEvent<DashboardEvent>[],
  budget: number,
): { start: number; events: SeqEvent<DashboardEvent>[]; bytes: number } {
  let start = source.length;
  let bytes = 0;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const size = estimateSeqEventBytes(source[index]!);
    if (bytes + size > budget) break;
    start = index;
    bytes += size;
  }
  return { start, events: source.slice(start), bytes };
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

  const prepared = prepareEntries(source, budget, { maxEventBytes: options.maxEventBytes });
  const turnStarts: number[] = [];
  for (let index = 0; index < prepared.events.length; index += 1) {
    if (isUserTurnStart(prepared.events[index]!)) turnStarts.push(index);
  }

  if (turnStarts.length === 0) {
    const suffix = selectBoundedSuffix(prepared.events, budget);
    return finalizeSelectedEntries(source, suffix.events, suffix.bytes, false, budget, options)
  }

  let selectedStart = turnStarts.at(-1)!;
  let selectedBytes = 0;
  for (let index = selectedStart; index < prepared.events.length; index += 1) {
    selectedBytes += estimateSeqEventBytes(prepared.events[index]!);
  }

  if (selectedBytes > budget) {
    const suffix = selectBoundedSuffix(prepared.events.slice(selectedStart), budget);
    const absoluteStart = selectedStart + suffix.start;
    return finalizeSelectedEntries(
      source,
      suffix.events,
      suffix.bytes,
      absoluteStart !== selectedStart || selectionContainsTruncation(suffix.events, prepared.truncatedSeqs),
      budget,
      options,
    );
  }

  for (let turn = turnStarts.length - 2; turn >= 0; turn -= 1) {
    const candidateStart = turnStarts[turn]!;
    let candidateBytes = 0;
    for (let index = candidateStart; index < selectedStart; index += 1) {
      candidateBytes += estimateSeqEventBytes(prepared.events[index]!);
    }
    if (selectedBytes + candidateBytes > budget) break;
    selectedStart = candidateStart;
    selectedBytes += candidateBytes;
  }

  const selected = prepared.events.slice(selectedStart);
  return finalizeSelectedEntries(
    source,
    selected,
    selectedBytes,
    selectionContainsTruncation(selected, prepared.truncatedSeqs),
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
