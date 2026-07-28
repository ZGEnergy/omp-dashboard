import type { ChatMessage, ToolCallState } from "./event-reducer.js";

export const DEFAULT_CHAT_RETAINED_TURNS = 400;
export const DEFAULT_TOOL_TIER_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TOOL_TIER_MAX_COUNT = 400;
/**
 * How many tool calls below the tool floor stay visible as `metadata` stubs
 * before collapsing into `EvictedToolBurst` markers.
 *
 * A metadata stub is ~200 B (vs. an unbounded full payload), so this tier can
 * be an order of magnitude deeper than the full tier for well under a megabyte
 * — and a stub keeps a readable, re-fetchable row where a marker only says
 * "N tool calls collapsed". See change: hydration-tool-stub-projection.
 */
export const DEFAULT_STUB_TIER_MAX_COUNT = 4000;

/** Start seq of the Nth-from-last user turn, lowered to a viewport pin below it. 0 keeps all. */
export function computeChatFloorSeq(
  messages: readonly ChatMessage[],
  retainedTurns: number,
  viewportFloorSeq: number | null,
): number {
  const turnStarts = messages
    .filter((m) => m.role === "user" && typeof m.seq === "number")
    .map((m) => m.seq as number)
    .sort((a, b) => a - b);
  let budgetFloor = 0;
  if (retainedTurns <= 0) {
    budgetFloor = turnStarts.length > 0 ? (turnStarts.at(-1) ?? 0) + 1 : 0;
  } else if (turnStarts.length > retainedTurns) {
    budgetFloor = turnStarts[turnStarts.length - retainedTurns]!;
  }
  if (viewportFloorSeq != null) return Math.min(budgetFloor, viewportFloorSeq);
  return budgetFloor;
}

/** Highest seq whose tool detail at-or-above fits the tighter byte+count budget. 0 keeps all. */
export function computeToolFloorSeq(
  toolCalls: Iterable<ToolCallState>,
  maxBytes: number,
  maxCount: number,
): number {
  const sized = [...toolCalls]
    .filter((t) => typeof t.seq === "number")
    .map((t) => ({ seq: t.seq as number, bytes: toolBytes(t) }))
    .sort((a, b) => a.seq - b.seq);
  let bytes = 0;
  let count = 0;
  let floor = 0;
  for (let i = sized.length - 1; i >= 0; i -= 1) {
    bytes += sized[i]!.bytes;
    count += 1;
    if (bytes > maxBytes || count > maxCount) {
      floor = sized[i]!.seq + 1;
      break;
    }
  }
  return floor;
}

function toolBytes(t: ToolCallState): number {
  try {
    return new TextEncoder().encode(JSON.stringify({ args: t.args, result: t.result })).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Seq of the Nth-from-last tool call — the boundary below which degraded rows
 * stop being worth keeping individually and collapse into markers.
 *
 * A pure COUNT bound, unlike `computeToolFloorSeq`: every row at this tier has
 * already shed its payload, so their cost is a near-constant per row and
 * byte-weighting them would measure payloads that are no longer there.
 * Returns 0 (keep all) when the count fits. See change: hydration-tool-stub-projection.
 */
export function computeStubFloorSeq(toolCalls: Iterable<ToolCallState>, maxCount: number): number {
  const seqs = [...toolCalls]
    .filter((t) => typeof t.seq === "number")
    .map((t) => t.seq as number)
    .sort((a, b) => a - b);
  if (maxCount <= 0) return seqs.length > 0 ? (seqs.at(-1) ?? 0) + 1 : 0;
  if (seqs.length <= maxCount) return 0;
  return seqs[seqs.length - maxCount]!;
}
