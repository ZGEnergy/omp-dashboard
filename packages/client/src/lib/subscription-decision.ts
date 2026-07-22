/**
 * Pure decision for whether/how to (re)subscribe the selected session's replay.
 *
 * Keeping this side-effect free lets the App subscription effect stay thin and
 * makes the in-app-navigation guarantees (issue #59) unit-testable without an
 * App render: returning to an already-subscribed session issues no replay, and
 * a transport reconnect resumes via a delta from the retained cursor instead of
 * a visible cold rebuild. A cold rebuild is reserved for a genuine first view or
 * a reconnect that has no retained, source-matched baseline to resume from.
 */

/** Why a replay subscribe was issued — surfaced in `[replay] begin` logs. */
export type ReplayReason =
  | "initial_navigation"
  | "transport_reconnect"
  | "source_reset"
  | "cache_miss"
  | "load_older"
  | "live_gap"
  | "conflict";

export interface SubscribeDecisionInput {
  selectedId: string | undefined;
  connected: boolean;
  /** The session already holds a live subscription on the current socket. */
  alreadySubscribed: boolean;
  /** This (re)subscribe continues an existing view (foreground or reconnect). */
  continuation: boolean;
  /** A source-matched, non-empty ledger tail is already retained in memory. */
  ledgerHasBaseline: boolean;
}

export interface SubscribeAction {
  subscribe: boolean;
  kind: "cold" | "delta";
  reason: ReplayReason;
}

export function computeSubscribeAction(input: SubscribeDecisionInput): SubscribeAction {
  // In-app navigation back to an already-subscribed session must not replay.
  if (!input.selectedId || !input.connected || input.alreadySubscribed) {
    return { subscribe: false, kind: "cold", reason: "initial_navigation" };
  }
  // A reconnect/foreground continuation over a retained tail resumes off-screen
  // via a delta; everything else (first view, or no retained baseline) is cold.
  const kind = input.continuation && input.ledgerHasBaseline ? "delta" : "cold";
  const reason: ReplayReason = input.continuation ? "transport_reconnect" : "initial_navigation";
  return { subscribe: true, kind, reason };
}
