import type { ChatMessage } from "./event-reducer.js";

/**
 * Extract the user's previously sent prompts from a session's chat message
 * list for use as an input-history source (bash-style ArrowUp recall).
 *
 * Rules:
 * - Keep only entries with `role === "user"`.
 * - Drop empty / whitespace-only contents.
 * - Collapse *consecutive* duplicate contents to a single entry (preserve
 *   non-consecutive duplicates — they represent legitimate re-sends after
 *   intervening work).
 * - Return newest-first: index `0` is the most recently sent prompt.
 *
 * The input `messages` array is assumed to be in chronological order
 * (oldest → newest), matching `SessionState.messages`.
 */
export function extractUserPromptHistory(messages: ChatMessage[]): string[] {
  const chronological: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const content = msg.content;
    if (typeof content !== "string") continue;
    if (content.trim() === "") continue;
    if (chronological.length > 0 && chronological[chronological.length - 1] === content) {
      continue;
    }
    chronological.push(content);
  }
  // Reverse so index 0 is newest.
  return chronological.reverse();
}
