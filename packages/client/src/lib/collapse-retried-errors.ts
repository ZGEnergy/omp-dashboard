/**
 * Two related collapse helpers used by ChatView to remove visual duplicates:
 *
 * 1. `findRetriedErrorIds` — failed toolResult immediately superseded by a
 *    successful retry of the same tool (see RetriedErrorBadge).
 * 2. `findActiveInteractiveToolResultIds` — a *running* toolResult paired
 *    with a *pending* interactiveUi message that follows it. The interactive
 *    card already shows the question + buttons, so the running tool card is
 *    pure duplication while the user has not yet answered. Once the prompt
 *    resolves, the toolResult flips to `complete` (no longer matches) and
 *    the chat shows the full tool card in history.
 *
 * Identifies failed `toolResult` messages that were immediately superseded
 * by a successful retry of the same tool, so the chat view can collapse
 * them into a compact "retried" badge instead of a full error card.
 *
 * Heuristic: an error toolResult is "retried" if, walking forward through
 * the message array and skipping intermediate `assistant` / `thinking` /
 * `turnSeparator` / `rawEvent` items, the very next `toolResult` shares
 * the same `toolName` AND has `toolStatus !== "error"`. Encountering a
 * `user` message, a different tool's `toolResult`, or running out of
 * messages aborts the look-ahead (the error is NOT considered retried).
 *
 * Pure / side-effect-free — returns a Set of message ids.
 */
import type { ChatMessage } from "./event-reducer.js";

const SKIP_ROLES: ReadonlySet<ChatMessage["role"]> = new Set([
  "assistant",
  "thinking",
  "turnSeparator",
  "rawEvent",
  "commandFeedback",
]);

export function findRetriedErrorIds(messages: ChatMessage[]): Set<string> {
  const retried = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "toolResult") continue;
    if (m.toolStatus !== "error") continue;
    if (!m.toolName) continue;

    // Look ahead, skipping non-blocking message kinds.
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (SKIP_ROLES.has(next.role)) continue;
      if (next.role !== "toolResult") break; // user / bashOutput / interactiveUi etc → abort
      if (next.toolName !== m.toolName) break; // different tool → not a retry
      if (next.toolStatus === "error") break; // chained errors → don't collapse the first
      // Successful (or running) retry of the same tool.
      retried.add(m.id);
      break;
    }
  }

  return retried;
}

/**
 * Returns ids of toolResults that are paired with a `pending` `interactiveUi`
 * message. ChatView hides these to avoid duplicating the question card while
 * the user has not yet answered.
 *
 * Pairing rule: a toolResult is paired with the very next non-skip message if
 * that message is an `interactiveUi` with `args.status === "pending"`. Skip
 * roles are the same as for retry detection (`assistant` / `thinking` /
 * `turnSeparator` / `rawEvent` / `commandFeedback`).
 *
 * The toolResult's own status is ignored on purpose: after a server restart,
 * `state-replay.ts` synthesizes a `tool_execution_end` for every orphan tool
 * call (including legitimately-pending `ask_user`), so the toolResult arrives
 * as `complete` while the prompt replayed from the in-memory pending-prompt
 * cache is still `pending`. Both must collapse to a single Confirm card.
 * Once the user answers, the interactiveUi flips to `resolved` / `cancelled`,
 * the helper stops hiding, and the chat shows the full tool card in history.
 */
export function findActiveInteractiveToolResultIds(messages: ChatMessage[]): Set<string> {
  const hidden = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "toolResult") continue;

    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (SKIP_ROLES.has(next.role)) continue;
      if (next.role !== "interactiveUi") break;
      const status = (next.args as { status?: string } | undefined)?.status;
      if (status === "pending") hidden.add(m.id);
      break;
    }
  }

  return hidden;
}
