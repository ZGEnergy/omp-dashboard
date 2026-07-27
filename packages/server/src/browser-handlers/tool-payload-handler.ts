import type {
  FetchToolPayloadMessage,
  ToolPayloadMessage,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { EventStore } from "../memory-event-store.js";

/**
 * Server-side cap on one `tool_payload` response, independent of the replay
 * tail budget. Above it the client gets a leading 2 MiB slice plus
 * `truncated: true`, and the UI offers "open raw".
 */
export const TOOL_PAYLOAD_RESPONSE_CAP = 2 * 1024 * 1024;

function toText(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a stubbed tool payload from the authoritative event store.
 *
 * Idempotent and side-effect free: it mutates no server state and enters no
 * ledger, so a failed fetch degrades to an error affordance on one row and
 * cannot corrupt the transcript.
 * See change: hydration-tool-stub-projection.
 */
export function handleFetchToolPayload(
  msg: FetchToolPayloadMessage,
  store: Pick<EventStore, "findToolEndEvent">,
): ToolPayloadMessage {
  const base = {
    type: "tool_payload" as const,
    sessionId: msg.sessionId,
    requestId: msg.requestId,
    toolCallId: msg.toolCallId,
  };
  const event = store.findToolEndEvent(msg.sessionId, msg.toolCallId);
  if (!event) return { ...base, error: "not_found" };
  const text = toText((event.data as Record<string, unknown> | undefined)?.result);
  if (text === undefined) return { ...base, error: "not_found" };
  if (text.length > TOOL_PAYLOAD_RESPONSE_CAP) {
    return { ...base, payload: text.slice(0, TOOL_PAYLOAD_RESPONSE_CAP), truncated: true };
  }
  return { ...base, payload: text };
}
