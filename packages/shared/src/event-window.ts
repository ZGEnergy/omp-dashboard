import { type PrepareEventForReplayOptions, prepareEventForReplay, utf8ByteLength } from "./prepare-event-for-replay.js";
import { makeToolStub, stubbedToolEndEvent, type ToolCallStub } from "./replay-projection.js";
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

/**
 * Fraction of the tail budget tool payloads may occupy. The remainder is a
 * reserved chat floor that tool content cannot take.
 *
 * This is the direct fix for issue #101, where one subagent burst consumed the
 * whole budget and left a transcript with no readable chat. A per-call cap
 * alone does not bound N calls x cap; only a hard aggregate ceiling does.
 * See change: hydration-tool-stub-projection.
 */
export const TOOL_CEILING_FRACTION = 0.25;

export interface ToolBudgetResult {
  events: SeqEvent<DashboardEvent>[];
  toolBytes: number;
  chatBytes: number;
  /** Count of logical calls degraded below `full`. */
  degraded: number;
  /** Count of logical calls reduced to `metadata`. */
  collapsed: number;
}

const TOOL_EVENT_TYPES = new Set(["tool_execution_start", "tool_execution_update", "tool_execution_end"]);

function toolCallIdOf(event: DashboardEvent): string | undefined {
  const id = (event.data as Record<string, unknown> | undefined)?.toolCallId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function resultTextOf(event: DashboardEvent): string {
  const result = (event.data as Record<string, unknown> | undefined)?.result;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  try {
    return JSON.stringify(result) ?? "";
  } catch {
    return "";
  }
}

/**
 * Enforce the tool ceiling / chat floor over a contiguous ascending range.
 *
 * Degrades logical tool calls down the ladder (`full` -> `sliced` ->
 * `metadata`) OLDEST-FIRST, so recent calls keep the most detail, until tool
 * bytes fit under `budgetBytes * TOOL_CEILING_FRACTION`.
 *
 * Blanks nothing and removes nothing: the returned seq set is identical to the
 * input's. Only `tool_execution_end` payloads change, and each becomes a
 * self-describing `ToolCallStub` re-fetchable by `toolCallId`. Chat events are
 * never touched — the chat floor is enforced by construction, not by trimming.
 *
 * A tool with no `tool_execution_end` in the range is still running and is
 * never degraded. Pure: the input array and its events are never mutated.
 */
interface LogicalCallEnd {
  index: number;
  toolCallId: string;
  /** The call's ANCHOR — its `tool_execution_start` seq, i.e. its row position. */
  startSeq: number;
}

/**
 * Index the terminal event of every logical tool call, ordered by ANCHOR so
 * "oldest-first" means oldest by transcript position rather than by end time
 * (they differ whenever calls overlap).
 */
function indexLogicalCallEnds(events: readonly SeqEvent<DashboardEvent>[]): LogicalCallEnd[] {
  const ends: LogicalCallEnd[] = [];
  const startSeqById = new Map<string, number>();
  for (let index = 0; index < events.length; index += 1) {
    const entry = events[index]!;
    const toolCallId = toolCallIdOf(entry.event);
    if (!toolCallId) continue;
    if (entry.event.eventType === "tool_execution_start" && !startSeqById.has(toolCallId)) {
      startSeqById.set(toolCallId, entry.seq);
    }
    if (entry.event.eventType === "tool_execution_end") {
      ends.push({ index, toolCallId, startSeq: startSeqById.get(toolCallId) ?? entry.seq });
    }
  }
  return ends.sort((a, b) => a.startSeq - b.startSeq);
}

/**
 * Rewrite one logical call's terminal event at `level`, or return `null` when
 * it already sits at that rung. Never moves the event: same seq, same
 * eventType, payload replaced by a stub.
 */
function degradeCallEnd(
  entry: SeqEvent<DashboardEvent>,
  toolCallId: string,
  level: ToolCallStub["detailLevel"],
): { replacement: SeqEvent<DashboardEvent>; wasFull: boolean } | null {
  const data = entry.event.data as Record<string, unknown> | undefined;
  const existing = data?.toolStub as ToolCallStub | undefined;
  if (existing?.detailLevel === level) return null;
  const raw = existing ? `${existing.head ?? ""}${existing.tail ?? ""}` : resultTextOf(entry.event);
  const stub = makeToolStub({
    toolCallId,
    toolName: typeof data?.toolName === "string" ? data.toolName : (existing?.toolName ?? "unknown"),
    args: data?.args as Record<string, unknown> | undefined,
    result: raw,
    status: data?.isError === true ? "error" : "ok",
    startedAt: typeof data?.startedAt === "number" ? data.startedAt : entry.event.timestamp,
    detailLevel: level,
  });
  // `raw` is already a slice once a stub exists; keep the ORIGINAL full size so
  // the UI reports the true unloaded byte count, not the sliced one.
  stub.fullBytes = existing ? existing.fullBytes : raw.length;
  return {
    replacement: { seq: entry.seq, event: stubbedToolEndEvent(entry.event, stub) },
    wasFull: existing === undefined,
  };
}

/**
 * Split the range's byte cost into tool-tier and chat-tier totals.
 *
 * Totals are tracked INCREMENTALLY from here on. Recomputing them inside the
 * degradation loop would re-serialize the whole range once per call — O(n^2)
 * over multi-hundred-KB payloads, which timed out at 500 calls.
 */
function tallyBytes(events: readonly SeqEvent<DashboardEvent>[]): { toolBytes: number; chatBytes: number } {
  let toolBytes = 0;
  let chatBytes = 0;
  for (const entry of events) {
    const size = estimateSeqEventBytes(entry);
    if (TOOL_EVENT_TYPES.has(entry.event.eventType)) toolBytes += size;
    else chatBytes += size;
  }
  return { toolBytes, chatBytes };
}

/**
 * One oldest-first degradation pass at a single rung. Mutates `out` in place
 * (it is already a private copy) and stops as soon as tool bytes fit.
 */
function degradePass(
  out: SeqEvent<DashboardEvent>[],
  ends: readonly LogicalCallEnd[],
  level: ToolCallStub["detailLevel"],
  startingToolBytes: number,
  ceiling: number,
): { toolBytes: number; degraded: number; collapsed: number } {
  let toolBytes = startingToolBytes;
  let degraded = 0;
  let collapsed = 0;
  for (const end of ends) {
    if (toolBytes <= ceiling) break;
    const entry = out[end.index]!;
    const result = degradeCallEnd(entry, end.toolCallId, level);
    if (!result) continue;
    const delta = estimateSeqEventBytes(result.replacement) - estimateSeqEventBytes(entry);
    // A stub envelope costs ~150-250 B, so degrading a call whose payload is
    // already smaller than that GROWS the range while destroying its output —
    // strictly worse on both axes. Leave those alone.
    if (delta >= 0) continue;
    toolBytes += delta;
    out[end.index] = result.replacement;
    if (result.wasFull) degraded += 1;
    if (level === "metadata") collapsed += 1;
  }
  return { toolBytes, degraded, collapsed };
}

export function applyToolBudget(
  events: readonly SeqEvent<DashboardEvent>[],
  budgetBytes: number,
): ToolBudgetResult {
  const ceiling = Math.floor(budgetBytes * TOOL_CEILING_FRACTION);
  const out = events.slice();
  const ends = indexLogicalCallEnds(out);
  const { toolBytes: initialToolBytes, chatBytes } = tallyBytes(out);

  let toolBytes = initialToolBytes;
  let degraded = 0;
  let collapsed = 0;
  // Two passes, oldest-first. Pass 1 slices; pass 2 collapses to metadata only
  // where slicing alone left tool bytes above the ceiling.
  for (const level of ["sliced", "metadata"] as const) {
    const pass = degradePass(out, ends, level, toolBytes, ceiling);
    toolBytes = pass.toolBytes;
    degraded += pass.degraded;
    collapsed += pass.collapsed;
  }

  return { events: out, toolBytes, chatBytes, degraded, collapsed };
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

/**
 * Snapshot the source's longest CONTIGUOUS SUFFIX, or `null` when the source is
 * genuinely invalid (bad entry shape, descending or duplicate seqs).
 *
 * A seq GAP is not invalid — it is the normal state of a trimmed session. The
 * memory event store's `trim()` drops the oldest non-essential events while
 * preserving `message_start`/`message_end` in place, so every session past
 * `DEFAULT_MAX_EVENTS_PER_SESSION` has a sparse retained range. Rejecting the
 * whole source on a gap made those sessions hydrate to a completely empty
 * transcript (only live-streamed events rendered).
 *
 * Windowing over the contiguous suffix serves the newest history while keeping
 * the DELIVERED range dense, which is non-negotiable: `SessionReplayLedger`
 * accepts strictly `cursor + 1` and resets on `gap_overflow`, so a sparse wire
 * model is not an option (that was PR #102's dead end).
 *
 * `truncatedAtGap` tells the caller older content exists below the suffix, so
 * `hasMoreOlder` stays accurate and load-older keeps working.
 * See change: fix-sparse-store-empty-hydration.
 */
function snapshotContiguousAscending(
  events: unknown,
): { snapshot: SeqEvent<DashboardEvent>[]; truncatedAtGap: boolean } | null {
  if (!Array.isArray(events)) return null;
  const all: SeqEvent<DashboardEvent>[] = [];
  let previousSeq: number | undefined;
  let lastGapIndex = -1;
  try {
    for (const entry of events) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as unknown as Record<string, unknown>;
      const seq = record.seq;
      const event = record.event;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq) || !isDashboardEvent(event)) return null;
      // Descending or duplicate seqs are corruption, not trimming — still fatal.
      if (previousSeq !== undefined && seq <= previousSeq) return null;
      if (previousSeq !== undefined && seq !== previousSeq + 1) lastGapIndex = all.length;
      all.push({ seq, event });
      previousSeq = seq;
    }
    return {
      snapshot: lastGapIndex === -1 ? all : all.slice(lastGapIndex),
      truncatedAtGap: lastGapIndex !== -1,
    };
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
  truncatedAtGap = false,
): EventWindowResult<T> {
  return {
    events: selected,
    // A source truncated at a gap always has older content below it, even when
    // the whole contiguous suffix fits the budget.
    hasMoreOlder: truncatedAtGap || selected.length < sourceLength,
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
  truncatedAtGap = false,
): EventWindowResult<DashboardEvent> {
  if (!options.registerInlineAsset) {
    return resultFromSelection(source.length, selected, bytes, partialHead, truncatedAtGap);
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
      truncatedAtGap,
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
    truncatedAtGap,
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
  const snapshotResult = snapshotContiguousAscending(eventsAsc);
  if (snapshotResult === null) return malformedWindow();
  const { snapshot: source, truncatedAtGap } = snapshotResult;
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

  // Return the complete bounded suffix. User-turn alignment must not discard
  // older tool events that already fit the byte budget, especially for paging.
  // Mark a partial head only when the bounded suffix begins inside a turn.
  // A suffix beginning at a user message is already turn-aligned, even when
  // older complete turns exist below it.
  const partialHead = selectionContainsTruncation(suffix, truncatedSeqs)
    || (!isUserTurnStart(suffix[0]!) && hasPreparedTurnStartBelow(source, suffixStart, perEventCap));
  return finalizeSelectedEntries(
    source,
    suffix,
    suffixBytes,
    partialHead,
    budget,
    options,
    truncatedAtGap,
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
  const snapshotResult = snapshotContiguousAscending(eventsAsc);
  if (snapshotResult === null) return malformedWindow();
  try {
    // Filter the RAW source, not the contiguous suffix: paging below the gap
    // must still see the older dense runs. `selectNewestEventsByBudget`
    // re-snapshots and picks that range's own contiguous suffix.
    const older = (eventsAsc as readonly SeqEvent<DashboardEvent>[]).filter((entry) => entry.seq < fromSeq);
    return selectNewestEventsByBudget(older, budgetBytes, options);
  } catch {
    return malformedWindow();
  }
}
