/**
 * State replay — synthesizes dashboard events from pi session entries
 * so the browser can rebuild the chat view after a reconnect or DB reset.
 */
import type { EventForwardMessage } from "../shared/protocol.js";

/**
 * Convert pi session entries (from ctx.sessionManager.getBranch())
 * into dashboard event_forward messages that the event reducer can process.
 *
 * Only generates the minimal events needed to rebuild the chat view:
 * - message_start for user messages
 * - message_update + message_end for assistant messages
 * - tool_execution_start / tool_execution_end for tool calls
 * - model_select for model changes
 */
export function replayEntriesAsEvents(
  sessionId: string,
  entries: any[],
): EventForwardMessage[] {
  const messages: EventForwardMessage[] = [];

  for (const entry of entries) {
    if (!entry || !entry.type) continue;
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

    if (entry.type === "message" && entry.message) {
      const msg = entry.message;

      if (msg.role === "user") {
        messages.push(makeEvent(sessionId, "message_start", ts, { message: msg }));
      }

      if (msg.role === "assistant") {
        const content = Array.isArray(msg.content) ? msg.content : [];
        // Emit tool_execution_start for each tool call
        for (const part of content) {
          if (part.type === "toolCall") {
            messages.push(makeEvent(sessionId, "tool_execution_start", ts, {
              toolCallId: part.id,
              toolName: part.name,
              args: typeof part.arguments === "string"
                ? tryParseJson(part.arguments)
                : part.arguments,
            }));
          }
        }
        // Emit message_update (sets streamingText) then message_end (finalizes)
        messages.push(makeEvent(sessionId, "message_update", ts, { message: msg }));
        messages.push(makeEvent(sessionId, "message_end", ts, { message: msg }));

        // Emit stats_update if usage data is present
        const usage = msg.usage as Record<string, unknown> | undefined;
        if (usage) {
          const cost = usage.cost as Record<string, number> | undefined;
          messages.push(makeEvent(sessionId, "stats_update", ts, {
            tokensIn: (usage.input as number) ?? 0,
            tokensOut: (usage.output as number) ?? 0,
            cost: cost?.total ?? 0,
            turnUsage: {
              input: (usage.input as number) ?? 0,
              output: (usage.output as number) ?? 0,
              cacheRead: (usage.cacheRead as number) ?? 0,
              cacheWrite: (usage.cacheWrite as number) ?? 0,
            },
          }));
        }
      }

      // Tool results: toolCallId and toolName are at the message level
      // Structure: { role: "toolResult", toolCallId, toolName, content: [{type:"text",text:"..."}], isError }
      if (msg.role === "toolResult" && msg.toolCallId) {
        const resultText = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : typeof msg.content === "string" ? msg.content : "";
        messages.push(makeEvent(sessionId, "tool_execution_end", ts, {
          toolCallId: msg.toolCallId,
          toolName: msg.toolName ?? "unknown",
          result: resultText,
          isError: msg.isError ?? false,
        }));
      }
    }

    if (entry.type === "model_change") {
      messages.push(makeEvent(sessionId, "model_select", ts, {
        type: "model_select",
        model: { provider: entry.provider, id: entry.modelId },
      }));
    }
  }

  return messages;
}

function makeEvent(
  sessionId: string,
  eventType: string,
  timestamp: number,
  data: Record<string, unknown>,
): EventForwardMessage {
  return {
    type: "event_forward",
    sessionId,
    event: {
      eventType,
      timestamp,
      data: { type: eventType, ...data },
    },
  };
}

function tryParseJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
