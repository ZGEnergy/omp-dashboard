/**
 * Pure trigger→notification mapper.
 *
 * Computes a small, link-only `PushPayload` from the session + the event that
 * fired `isUnreadTrigger`. Title/body are chosen for the three trigger kinds
 * (turn-done, ask_user, crash). Body content is truncated to stay well under
 * the 4 KB push-payload ceiling and to avoid leaking full event content
 * (design Decision 5). No I/O — trivially unit-testable.
 * See change: add-server-push-notifications.
 */
import type { DashboardEvent, DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { PushPayload } from "./push-transports/types.js";

const MAX_ERROR_LEN = 160;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Human label for the session — its name, or a short id fallback. */
function sessionLabel(session: DashboardSession): string {
  const name = session.name?.trim();
  return name && name.length > 0 ? name : session.id;
}

export function buildPushPayload(session: DashboardSession, event: DashboardEvent): PushPayload {
  const label = sessionLabel(session);
  const url = `/session/${session.id}`;

  // Trigger 3: agent_end with a truthy error → crash notification.
  const err = event.eventType === "agent_end" ? (event.data as { error?: unknown }).error : undefined;
  if (err) {
    const errText = typeof err === "string" ? err : "the agent ended with an error";
    return {
      type: "session_attention",
      sessionId: session.id,
      title: "Pi session crashed",
      body: `${label} — ${truncate(errText, MAX_ERROR_LEN)}`,
      url,
    };
  }

  // Trigger 2: waiting for user input.
  if (session.currentTool === "ask_user") {
    return {
      type: "session_attention",
      sessionId: session.id,
      title: "Pi session needs your input",
      body: `${label} is waiting for you`,
      url,
    };
  }

  // Trigger 1 (default): turn finished.
  return {
    type: "session_attention",
    sessionId: session.id,
    title: "Pi session finished a turn",
    body: `${label} is ready`,
    url,
  };
}
