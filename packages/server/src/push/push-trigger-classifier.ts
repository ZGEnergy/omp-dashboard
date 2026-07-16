/**
 * Pure push-trigger classification.
 *
 * This maps the existing unread-trigger matrix into the two user-selected
 * notification buckets. It deliberately has no transport or persistence
 * behavior; event-wiring owns the viewed/replay gate and fanout attempt.
 */
import type { DashboardEvent, SessionStatus } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { isInputNeededTool } from "@blackbelt-technology/pi-dashboard-shared/input-needed-tools.js";
import { isUnreadTrigger } from "../event-status-extraction.js";

export type PushTriggerBucket = "actions-required" | "claude-decides";
export type PushTriggerKind = "input-needed" | "crash" | "turn-done";

export interface PushTriggerClassification {
  kind: PushTriggerKind;
  bucket: PushTriggerBucket;
}
export interface PushTriggerSnapshot {
  status?: SessionStatus;
  currentTool?: string | null;
}

export interface PushTriggerPreferences {
  actionsRequired: boolean;
  claudeDecides: boolean;
}

/**
 * Map one existing event and the status/tool edge it caused to a preference
 * bucket and provenance kind. Unknown or non-trigger events return null. Crash
 * takes precedence over a simultaneous turn-done transition.
 */
export function classifyPushTrigger(
  event: Pick<DashboardEvent, "eventType" | "data">,
  before: PushTriggerSnapshot,
  after: PushTriggerSnapshot,
): PushTriggerClassification | null {
  // Keep push classification coupled to the shipping unread matrix. This
  // prevents push-only attention semantics from drifting from unread state.
  if (!isUnreadTrigger(event.eventType, before, after, event.data)) return null;

  // Crash wins over turn completion when agent_end carries a truthy error.
  if (event.eventType === "agent_end" && Boolean(event.data?.error)) {
    return { kind: "crash", bucket: "actions-required" };
  }

  // Input-needed transitions include dashboard ask_user and pi core ask.
  if (isInputNeededTool(after.currentTool) && !isInputNeededTool(before.currentTool)) {
    return { kind: "input-needed", bucket: "actions-required" };
  }

  // A completed turn is the streaming → idle/active edge.
  if (
    before.status === "streaming" &&
    (after.status === "idle" || after.status === "active")
  ) {
    return { kind: "turn-done", bucket: "claude-decides" };
  }

  return null;
}
