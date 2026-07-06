/**
 * Temporal (burst) grouping — the OUTER pass over the existing semantic (×N)
 * `groupConsecutiveToolCalls`. A run of consecutive heterogeneous `toolResult`
 * rows collapses into ONE burst group so an investigation turn (grep → read →
 * grep → read …) renders as a single progress-aware block instead of a flat
 * wall of rows.
 *
 * Composition — burst OUTER, semantic INNER. The burst pass walks the RAW
 * reducer `ChatMessage[]` with its OWN boundary rules, then hands each formed
 * burst's member slice to `groupConsecutiveToolCalls` so identical sub-runs
 * (`↻ … ×24` polling loops) nest INSIDE the burst. `group-tool-calls.ts` stays
 * byte-for-byte untouched.
 *
 * Why burst-first: the semantic pass treats `assistant` as transparent
 * UNCONDITIONALLY, so a prose row between two identical calls would be absorbed
 * into a ×N group and never reach a boundary check (over-merge). Running the
 * burst pass first with a prose-aware boundary fixes this (design finding 2).
 *
 * See change: group-tool-call-bursts.
 */
import type { ChatMessage } from "./event-reducer.js";
import { type ChatItem, groupConsecutiveToolCalls } from "./group-tool-calls.js";

/**
 * Roles absorbed while walking a burst (never terminate it). Mirrors the
 * semantic pass's transparent set MINUS `assistant`, which the burst pass
 * discriminates by emptiness (empty = transparent, non-empty prose = HARD
 * boundary). That empty-vs-non-empty split is NEW logic this change introduces.
 */
const BURST_TRANSPARENT_ROLES: ReadonlySet<ChatMessage["role"]> = new Set([
  "thinking",
  "turnSeparator",
  "rawEvent",
  "commandFeedback",
]);

/** A row that does not terminate a burst run. */
function isTransparent(m: ChatMessage): boolean {
  if (BURST_TRANSPARENT_ROLES.has(m.role)) return true;
  // Empty assistant prose (tool-only turn filler) is transparent; non-empty
  // assistant prose is a HARD boundary (the turn's actual reply).
  if (m.role === "assistant" && m.content.trim() === "") return true;
  return false;
}

/**
 * A temporal burst group. `items` is the semantic-pass output over the burst's
 * member slice, so nested `×N` groups (`ToolCallGroup`) sit alongside
 * individual `ChatMessage` rows. `id` = first member's stable id (React key;
 * survives event-trim head churn where positional `idx` would bleed collapse
 * state between bursts, design finding 3).
 */
export interface ToolBurstGroup {
  type: "burst";
  id: string;
  items: ChatItem[];
}

/**
 * Output row: a plain message, a bare semantic `×N` group (sub-threshold burst
 * that still folded a poll loop), or a temporal burst wrapping both.
 */
export type BurstItem = ChatItem | ToolBurstGroup;

/** Count post-semantic "members" (a nested ×N group is one member). */
function memberCount(items: ChatItem[]): number {
  let n = 0;
  for (const it of items) {
    if ((it as { type?: string }).type === "group") n += 1;
    else if ((it as ChatMessage).role === "toolResult") n += 1;
  }
  return n;
}

/**
 * Exclusive index past the final `toolResult` of the burst starting at `start`
 * (a `toolResult`). Walks across transparent rows; stops at the first HARD row.
 */
function burstEnd(messages: ChatMessage[], start: number): number {
  let lastToolEnd = start + 1;
  for (let j = start + 1; j < messages.length; j++) {
    const next = messages[j];
    if (isTransparent(next)) continue;
    if (next.role !== "toolResult") break;
    lastToolEnd = j + 1;
  }
  return lastToolEnd;
}

/**
 * Group consecutive heterogeneous `toolResult` runs into burst groups.
 *
 * A burst is a maximal run of `toolResult` rows walked across transparent rows
 * (see `isTransparent`); any HARD row (`user`, non-empty `assistant`,
 * `interactiveUi`, `bashOutput`, `inlineTerminal`, …) terminates it. The
 * member slice is passed to `groupConsecutiveToolCalls`; if the result has ≥ 3
 * post-semantic members the burst forms, otherwise the semantic-pass items are
 * emitted verbatim (so a pure `×24` poll stays a bare group, and a
 * sub-threshold heterogeneous run stays flat — byte-identical to today).
 */
export function groupToolBursts(messages: ChatMessage[]): BurstItem[] {
  const result: BurstItem[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role !== "toolResult") {
      result.push(msg);
      i++;
      continue;
    }

    // Maximal burst slice: consecutive toolResults across transparent rows.
    // `lastToolEnd` (exclusive) sits past the final toolResult, so trailing
    // transparents belong to the next iteration.
    const lastToolEnd = burstEnd(messages, i);
    const slice = messages.slice(i, lastToolEnd);
    const items = groupConsecutiveToolCalls(slice);

    if (memberCount(items) >= 3) {
      result.push({ type: "burst", id: msg.id, items });
    } else {
      for (const it of items) result.push(it as BurstItem);
    }
    i = lastToolEnd;
  }

  return result;
}
