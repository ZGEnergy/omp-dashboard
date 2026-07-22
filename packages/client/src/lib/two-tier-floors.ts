import type { ChatMessage, ToolCallState } from "./event-reducer.js";

export const DEFAULT_CHAT_RETAINED_TURNS = 400;
export const DEFAULT_TOOL_TIER_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TOOL_TIER_MAX_COUNT = 400;

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
  if (turnStarts.length > retainedTurns) {
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
