/**
 * Groups consecutive tool call messages with the same tool name and similar args.
 * Used to collapse repetitive retry loops (e.g. health check polling) in the chat view.
 */
import type { ChatMessage } from "./event-reducer.js";

export interface ToolCallGroup {
  type: "group";
  toolName: string;
  messages: ChatMessage[];
  /** Summary from the first message's args */
  summary: string;
}

export type ChatItem = ChatMessage | ToolCallGroup;

/**
 * Check if two sets of tool args are similar enough to group.
 * Compares JSON-stringified args for exact match.
 */
function argsSimilar(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Group consecutive toolResult messages with the same toolName and similar args.
 * Returns a mixed array of ChatMessage and ToolCallGroup items.
 * Single items are never grouped. Running (last) items are never grouped.
 */
export function groupConsecutiveToolCalls(messages: ChatMessage[]): ChatItem[] {
  const result: ChatItem[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // Only group toolResult messages
    if (msg.role !== "toolResult") {
      result.push(msg);
      i++;
      continue;
    }

    // Collect consecutive toolResults with same name and similar args
    const group: ChatMessage[] = [msg];
    let j = i + 1;
    while (j < messages.length) {
      const next = messages[j];
      if (next.role !== "toolResult") break;
      if (next.toolName !== msg.toolName) break;
      if (!argsSimilar(next.args, msg.args)) break;
      // Don't include a currently-running tool in a collapsed group
      if (next.toolStatus === "running") break;
      group.push(next);
      j++;
    }

    if (group.length >= 3) {
      result.push({
        type: "group",
        toolName: msg.toolName ?? "unknown",
        messages: group,
        summary: msg.toolName ?? "unknown",
      });
    } else {
      // Not enough to group — push individually
      for (const m of group) result.push(m);
    }
    i = j;
  }

  return result;
}
