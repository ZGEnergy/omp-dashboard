/**
 * Pure helpers for the windowed (TanStack Virtual) chat transcript.
 *
 * `ChatView` renders a windowed list over the heterogeneous `displayRows`
 * (the prefs-filtered `groupToolBursts` output). These helpers are the pure,
 * unit-testable core of that windowing — the virtualizer key, the per-row-type
 * pre-measure size estimate, and the `turnIndex → first-row-index` map that
 * backs `ChatViewHandle.scrollToTurn`.
 *
 * See change: virtualize-chat-transcript-tanstack (Phase 2 Step B). Doubt-Review
 * corrections CR-3 (per-type key), CR-4 (turn map over the filtered rows).
 */
import type { ChatMessage, EvictedToolBurst } from "./event-reducer.js";
import type { BurstItem, ToolBurstGroup } from "./group-tool-bursts.js";
import type { ToolCallGroup } from "./group-tool-calls.js";

/**
 * A display row after interleaving evicted-tool-burst markers into
 * `BurstItem[]` (see `interleaveEvictedBursts`). See change:
 * bounded-hot-transcript-state (blocking-fix follow-up).
 */
export type DisplayRow = BurstItem | EvictedToolBurst;

/** A temporal burst group row. */
export function isBurst(item: DisplayRow): item is ToolBurstGroup {
  return (item as ToolBurstGroup).type === "burst";
}

/** A bare semantic ×N group row. */
export function isGroup(item: DisplayRow): item is ToolCallGroup {
  return (item as ToolCallGroup).type === "group";
}

/**
 * An interleaved `EvictedToolBurst` marker row (as opposed to a real
 * `BurstItem`). Distinguished structurally: bursts/groups carry `type`,
 * messages carry `role`; an `EvictedToolBurst` carries neither, only
 * `fromSeq`/`toSeq`/`count`. See change: bounded-hot-transcript-state
 * (blocking-fix follow-up).
 */
export function isEvictedBurst(item: DisplayRow): item is EvictedToolBurst {
  return typeof item === "object" && item !== null && !("type" in item) && !("role" in item) && "fromSeq" in item;
}

/**
 * Stable virtualizer/React key for a display row (CR-3). Mirrors the current
 * render keys per row type:
 *   burst  → `burst.id` (first tool-like member id; survives head-trim churn)
 *   group  → first member key, else `group-<toolName>` (position-independent;
 *            a populated group always keys off its stable first-member id, so
 *            the empty fallback is defensive/unreachable — groups emit at >= 3
 *            members. A positional `group-<index>` renumbered on Load-older
 *            re-reduce, bouncing scroll anchors. See change:
 *            load-older-viewport-bounce.)
 *   message→ `messageKey(msg)`
 * Uniqueness is a hard precondition for measurement caching under windowing.
 */
export function virtualRowKey(item: DisplayRow, _index: number): string {
  if (isEvictedBurst(item)) return `evicted-${item.fromSeq}-${item.toSeq}`;
  if (isBurst(item)) return item.id;
  if (isGroup(item)) { const first = item.messages[0]; return first ? messageKey(first) : `group-${item.toolName}`; }
  return messageKey(item as ChatMessage);
}

/**
 * Position-independent key for a chat message. Reducer ids (`msg-N`) are
 * positional and shift whenever an older replay page prepends rows, which
 * silently re-pointed scroll anchors at the wrong row. Live rows carry a
 * bridge nonce (never flips when `entry_persisted` later stamps `entryId`);
 * replayed rows carry the persisted entry id. Positional id is the fallback.
 */
function messageKey(message: ChatMessage): string {
  return message.nonce ?? message.entryId ?? message.id;
}

/**
 * Content-aware pre-measure size estimate (change: fix-chat-scroll-to-top-
 * estimate-drift, Decision 1). Only affects first-paint offset error —
 * `measureElement` caches each row's real rendered height after mount. A
 * STATIC per-role constant under-shot the largest rows by 10-50x (a pasted-
 * image user row, a 24k-char toolResult), so as they mounted during an upward
 * scroll `getTotalSize()` jumped and the top receded. Scaling the estimate by
 * the row's text payload shrinks that estimate error `delta`, which shrinks
 * TanStack's built-in above-viewport correction below perception.
 *
 * `textChars` is the row's precomputed aggregate rendered text length (see
 * `computeRowTextChars`), passed in so this stays **O(1) per row, pure, memo-
 * safe** — it is called during windowing on every scroll pass and MUST NOT
 * walk content blocks. Image presence is read O(1) from `item.images`.
 *
 * Constants derived from the repro height distribution (session `019f43e4`):
 * 9240 chars -> ~2300px and 24071 chars -> ~6000px both give ~0.25 px/char,
 * i.e. LINE_PX / CHARS_PER_LINE = 20 / 80. Acceptance is the convergence e2e,
 * not intuition (task 2.4).
 */
const CHARS_PER_LINE = 80;
const LINE_PX = 20;
/**
 * Upper bound on the pre-measure text reserve. Bounds the reserve for a
 * pathological 100k-char row (would otherwise reserve ~25000px of empty
 * spacer); the residual delta above the clamp is absorbed by the built-in
 * corrector + the scroll-to-top affordance. 8000px covers ~32k chars
 * accurately — above the largest observed row (24k chars / ~6000px).
 */
const TEXT_RESERVE_CLAMP = 8000;
/**
 * Per-renderer-kind image reserve. Caps differ by render path (verified):
 * user attachments `max-h-[300px]` (ChatView ImageAttachments), tool-result
 * images `max-h-[512px]` (ToolResultImages). NOT one global constant.
 */
const IMAGE_RESERVE_USER = 300;
const IMAGE_RESERVE_TOOL_RESULT = 512;

/** Base (chrome) height per row type, before the text/image reserve. */
function baseRowSize(role: ChatMessage["role"]): number {
  switch (role) {
    case "turnSeparator":
      return 24;
    case "commandFeedback":
      return 48;
    case "thinking":
    case "advisor":
      return 72;
    case "user":
      return 96;
    case "toolResult":
      return 120;
    case "rawEvent":
      return 120;
    case "assistant":
      return 140;
    case "bashOutput":
      return 160;
    case "interactiveUi":
      return 160;
    case "inlineTerminal":
      return 220;
    default:
      return 120;
  }
}

export function estimateVirtualRowSize(item: DisplayRow, textChars = 0): number {
  // Evicted-burst markers are a single-line, fixed-chrome row (see
  // EvictedToolBurstMarkerRow) — small constant, no text reserve.
  if (isEvictedBurst(item)) return 32;
  // Burst/group rows keep type constants — their variance is small relative to
  // text rows and their aggregate text is folded into child cards.
  if (isBurst(item)) return 220;
  if (isGroup(item)) return 64;
  const msg = item as ChatMessage;
  const textReserve = Math.min(Math.ceil(textChars / CHARS_PER_LINE) * LINE_PX, TEXT_RESERVE_CLAMP);
  let size = baseRowSize(msg.role) + textReserve;
  if (msg.images && msg.images.length > 0) {
    size += msg.role === "toolResult" ? IMAGE_RESERVE_TOOL_RESULT : IMAGE_RESERVE_USER;
  }
  return size;
}

/**
 * Aggregate rendered text length for a display row (change: fix-chat-scroll-to-
 * top-estimate-drift, task 2.1). Walks the row ONCE — call it when `displayRows`
 * is built (in the ChatView `useMemo`), cache the result, and feed it to
 * `estimateVirtualRowSize` so `estimateSize` never re-walks per scroll pass.
 * Burst/group rows sum their members so their (unused) reserve stays bounded.
 */
export function computeRowTextChars(item: DisplayRow): number {
  if (isEvictedBurst(item)) return 0;
  if (isBurst(item)) {
    let sum = 0;
    for (const sub of item.items) {
      sum += isGroup(sub) ? groupTextChars(sub) : messageTextChars(sub as ChatMessage);
    }
    return sum;
  }
  if (isGroup(item)) return groupTextChars(item);
  return messageTextChars(item as ChatMessage);
}

function messageTextChars(m: ChatMessage): number {
  return m.content.length + (m.result?.length ?? 0);
}

function groupTextChars(g: ToolCallGroup): number {
  let sum = 0;
  for (const m of g.messages) sum += messageTextChars(m);
  return sum;
}

/**
 * Build `turnIndex → first display-row index` (CR-4, Decision 4).
 *
 * `turnIndex` is assigned only to the (last) user message of a turn, not to
 * burst/group rows. A turn's navigable rows are therefore the top-level
 * `ChatMessage` rows carrying `turnIndex` — the same rows that render
 * `data-turn` today. First row wins (a later duplicate turnIndex is ignored).
 * Built over the FILTERED `displayRows` so the resulting index feeds
 * `virtualizer.scrollToIndex` directly.
 */
export function buildTurnToFirstRowIndex(rows: DisplayRow[]): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (isEvictedBurst(item) || isBurst(item) || isGroup(item)) continue;
    const turnIndex = (item as ChatMessage).turnIndex;
    if (turnIndex != null && !map.has(turnIndex)) {
      map.set(turnIndex, i);
    }
  }
  return map;
}

// --- Active-selection retention (change: preserve-chat-selection-during-churn) ---

/** Inclusive display-row index span [min..max] a selection intersects. */
export interface SelectionRowSpan {
  min: number;
  max: number;
}

/**
 * Resolve a Range endpoint node to its display-row index by walking up to the
 * nearest mounted `[data-index]` element. Returns `null` when the node is not
 * inside a virtual row (streaming tail, pending-steer/prompt, header/composer —
 * none carry `data-index`).
 */
function endpointRowIndex(node: Node | null, container: HTMLElement): number | null {
  if (!node) return null;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const rowEl = el?.closest?.("[data-index]") ?? null;
  if (!rowEl || !container.contains(rowEl)) return null;
  const idx = Number(rowEl.getAttribute("data-index"));
  return Number.isInteger(idx) ? idx : null;
}

/**
 * Clamp a NON-virtual endpoint (no `[data-index]`) to the nearest virtual
 * boundary by document order: a node preceding the container clamps to the
 * first row (0); a node following/contained-below (streaming tail, pending)
 * clamps to the last row (`rowCount - 1`).
 */
function clampEndpointToBoundary(node: Node, container: HTMLElement, rowCount: number): number {
  const pos = container.compareDocumentPosition(node);
  return pos & Node.DOCUMENT_POSITION_PRECEDING ? 0 : rowCount - 1;
}

/**
 * Map a DOM `Range` to the inclusive display-row span it intersects (D3).
 *
 * Walks `startContainer`/`endContainer` up to the nearest `[data-index]` row.
 * Endpoints in a non-virtual region clamp to the nearest virtual boundary.
 * Reversed and same-row selections normalize via `min`/`max`. Returns `null`
 * when the selection touches no virtual row (e.g. entirely inside the streaming
 * tail, or entirely outside the transcript).
 *
 * PURE + O(1)-ish (two ancestor walks): the caller reads this on every
 * `selectionchange` while all rows are still mounted, storing the result in a
 * ref so `rangeExtractor` keeps those rows mounted BEFORE any unmount can move
 * the live Range endpoints. The retained-row ceiling is applied by the caller
 * (device-aware via `useMobile()`), not here.
 */
export function rangeToRowIndexSpan(
  range: Range,
  container: HTMLElement,
  rowCount: number,
): SelectionRowSpan | null {
  if (rowCount <= 0) return null;
  const { startContainer, endContainer } = range;
  const startIn = container.contains(startContainer);
  const endIn = container.contains(endContainer);
  if (!startIn && !endIn) return null; // selection does not touch the transcript

  const startIdx = endpointRowIndex(startContainer, container);
  const endIdx = endpointRowIndex(endContainer, container);
  if (startIdx == null && endIdx == null) return null; // only non-virtual regions

  const a = startIdx ?? clampEndpointToBoundary(startContainer, container, rowCount);
  const b = endIdx ?? clampEndpointToBoundary(endContainer, container, rowCount);
  const min = Math.max(0, Math.min(a, b));
  const max = Math.min(rowCount - 1, Math.max(a, b));
  return { min, max };
}

/**
 * Best-effort `seq` for a display row, used to report the viewport floor
 * (Task 1.7, change: bounded-hot-transcript-state) and to position evicted-
 * burst markers (`interleaveEvictedBursts`, blocking-fix follow-up). Burst/
 * group rows report their first underlying member's `seq` — good enough for
 * a floor (eviction only needs a conservative lower bound, not an exact
 * per-row value). An `EvictedToolBurst` marker reports its `toSeq` (its
 * newest evicted seq) so ordering treats it as sitting just before whatever
 * real row comes next.
 */
export function rowSeq(item: DisplayRow): number | undefined {
  if (isEvictedBurst(item)) return item.toSeq;
  if (isBurst(item)) {
    for (const sub of item.items) {
      const seq = isGroup(sub) ? sub.messages[0]?.seq : (sub as ChatMessage).seq;
      if (seq != null) return seq;
    }
    return undefined;
  }
  if (isGroup(item)) return item.messages[0]?.seq;
  return (item as ChatMessage).seq;
}

/**
 * Lowest `seq` among display rows in the inclusive index range
 * `[startIndex, endIndex]` (typically the virtualizer's current visible
 * range), or `null` when the range is empty or no row in it carries a `seq`.
 * Pure + O(range length) — safe to call on every virtualizer range change.
 */
export function lowestVisibleSeq(rows: readonly DisplayRow[], startIndex: number, endIndex: number): number | null {
  let lowest: number | null = null;
  const lo = Math.max(0, startIndex);
  const hi = Math.min(rows.length - 1, endIndex);
  for (let i = lo; i <= hi; i++) {
    const seq = rowSeq(rows[i]!);
    if (seq != null && (lowest === null || seq < lowest)) lowest = seq;
  }
  return lowest;
}

/**
 * Interleave `EvictedToolBurst` markers into `rows` at their seq position,
 * ordered ascending by seq among the surviving rows — NOT unconditionally at
 * the top. `evictBelow` prunes the tool and chat tiers against independent
 * floors, so a tool-heavy few-turn session can have `toolFloorSeq >
 * chatFloorSeq`: an evicted tool run then sits BELOW some still-retained
 * chat-tier rows, and a marker rendered at the top would misrepresent it as
 * older than everything currently shown.
 *
 * Walks `rows` once; before emitting a row that carries a `seq`
 * (`rowSeq(row)`), flushes every pending marker whose `toSeq` is strictly
 * below that row's seq (i.e. every marker that is older than this row).
 * Rows without a `seq` never trigger a flush — markers stay pending past
 * them and settle at the next seq-bearing row (or at the very end, if none
 * follows). Pure: returns a new array; neither input is mutated.
 *
 * See change: bounded-hot-transcript-state (blocking-fix follow-up).
 */
export function interleaveEvictedBursts(
  rows: readonly BurstItem[],
  bursts: readonly EvictedToolBurst[],
): DisplayRow[] {
  if (bursts.length === 0) return [...rows];
  const sorted = [...bursts].sort((a, b) => a.fromSeq - b.fromSeq);
  const result: DisplayRow[] = [];
  let bi = 0;
  for (const row of rows) {
    const seq = rowSeq(row);
    if (seq !== undefined) {
      while (bi < sorted.length && sorted[bi]!.toSeq < seq) {
        result.push(sorted[bi]!);
        bi += 1;
      }
    }
    result.push(row);
  }
  while (bi < sorted.length) {
    result.push(sorted[bi]!);
    bi += 1;
  }
  return result;
}

/**
 * Union an active selection's row span into the virtualizer's default range
 * (D3). Returns `base` unchanged when there is no span OR when the span exceeds
 * the retained-row ceiling `cap` (past the cap the caller ACTIVELY clears the
 * selection rather than force-mounting the span or handing back a silently
 * truncated copy). Result stays sorted ascending and within `[0, count)` as the
 * virtualizer requires.
 */
export function extendRangeWithSelection(
  base: number[],
  span: SelectionRowSpan | null,
  cap: number,
  count: number,
): number[] {
  if (!span) return base;
  if (span.max - span.min + 1 > cap) return base; // past ceiling: caller clears
  const set = new Set(base);
  const lo = Math.max(0, span.min);
  const hi = Math.min(count - 1, span.max);
  for (let i = lo; i <= hi; i++) set.add(i);
  return Array.from(set).sort((a, b) => a - b);
}
