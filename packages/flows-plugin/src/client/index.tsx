/**
 * Client entry barrel for the flows plugin.
 *
 * Re-exports every flow-related React component so the dashboard shell
 * can import them via `@blackbelt-technology/pi-dashboard-flows-plugin/client`.
 *
 * Also exports the `hasActiveFlow` predicate consumed by the
 * `pi-dashboard-plugin` manifest's `session-card-badge` claim.
 */


// Existing presentation components — still used directly by App.tsx
// during the cutover (Part H removes those call sites).
export { FlowDashboard } from "./FlowDashboard.js";
export { FlowAgentCard } from "./FlowAgentCard.js";
export { FlowAgentDetail } from "./FlowAgentDetail.js";
export { FlowSummary } from "./FlowSummary.js";
export { FlowGraph, flowStateToGraphSteps, architectStepsToGraphSteps, computeLayout } from "./FlowGraph.js";
export { FlowArchitect, FlowArchitectDetail, ArchitectInputPrompt } from "./FlowArchitect.js";
export { FlowActivityBadge } from "./FlowActivityBadge.js";
export { FlowLaunchDialog } from "./FlowLaunchDialog.js";
export { FlowTabBar } from "./FlowTabBar.js";
export { SessionFlowActions } from "./SessionFlowActions.js";

// Slot-claim wrappers — the plugin's manifest references these.
// Each derives state from the plugin-internal contexts and dispatches
// via pluginContext.send. See change: pluginize-flows-via-registry.
export { FlowActivityBadgeClaim } from "./FlowActivityBadge.js";
export { FlowDashboardClaim } from "./FlowDashboard.js";
export { FlowArchitectClaim, FlowArchitectDetailClaim } from "./FlowArchitect.js";
export { FlowAgentDetailClaim } from "./FlowAgentDetail.js";
export { FlowSummaryClaim } from "./FlowSummary.js";
export { FlowYamlPreviewClaim } from "./FlowYamlPreview.js";
export { SessionFlowActionsClaim } from "./SessionFlowActions.js";

// Manifest-level shouldRender predicate for the `session-card-flows` claim.
// See change: add-flows-subcard.
export { shouldRenderFlowsSubcard } from "./shouldRender.js";

// Flow slash commands (`/flows`, `/flows:new`, `/flows:edit`, `/flows:delete`)
// are no longer claimed by the dashboard plugin manifest. Flow operations
// surface through buttons only (`SessionFlowActions`, `FlowLaunchDialog`,
// `FlowDashboard` Abort). pi-flows itself continues to register the slash
// commands for TUI users. See change: fix-pi-flows-end-to-end (Group 8).
//
// The FlowsCommandRoutes module is no longer exported from this barrel.
// Restore the exports here if/when the dashboard re-introduces command-route
// claims for flows.

// Plugin-internal state hooks. Components consume these in place of
// props that previously came from App.tsx. See change:
// pluginize-flows-via-registry.
export {
  useFlowsSessionState,
  reduceFlowsSessionState,
} from "./FlowsSessionStateContext.js";
export type { FlowsSessionState } from "./FlowsSessionStateContext.js";
import { getFlowsUiStateSnapshot } from "./FlowsUiStateContext.js";
import { installFlowsAvailabilitySubscriber } from "./flowsAvailability.js";

// Install the per-session flows-availability subscriber once at module
// load. The subscriber populates the sync cache that
// `shouldRenderFlowsSubcard` reads. Idempotent (guarded inside the
// installer). See change: add-flows-subcard (design.md Decision 3 —
// module-level subscriber breaks the chicken-and-egg cycle between
// the predicate and the component it gates).
installFlowsAvailabilitySubscriber();
export {
  useFlowsUiState,
  useFlowsUiActions,
} from "./FlowsUiStateContext.js";
export { getFlowsUiStateSnapshot } from "./FlowsUiStateContext.js";
export type { FlowsUiState, FlowsUiActions } from "./FlowsUiStateContext.js";

// hasActiveFlow predicate removed: the manifest no longer references
// it because FlowActivityBadgeClaim self-gates inside the component
// body via useFlowsSessionState. See change:
// pluginize-flows-via-registry.

// ── content-view claim predicates ─────────────────────────────────
//
// Each `content-view` claim in the manifest references one of these
// predicates via the `predicate` field. The slot consumer calls the
// predicate at render time; the first claim (priority order) whose
// predicate returns `true` renders. If none return `true`, the slot
// renders nothing and the shell's fallback shows the chat.
//
// Each predicate reads the plugin's UI-state store imperatively (via
// `getFlowsUiStateSnapshot` — not a hook, safe outside React) so it
// can run from the slot-registry filter. The `_session` argument is
// passed by the slot system per the predicate contract
// (`(props) => boolean`) but is unused here because activation lives
// in plugin state, not session state.
//
// See change: pluginize-flows-via-registry (design.md Decision 3
// RECONSIDERED — predicates over routes).

export function isFlowAgentDetailActive(_session?: unknown): boolean {
  return getFlowsUiStateSnapshot().flowDetailAgent !== null;
}

export function isFlowArchitectDetailActive(_session?: unknown): boolean {
  return getFlowsUiStateSnapshot().architectDetailOpen;
}

export function isFlowYamlPreviewActive(_session?: unknown): boolean {
  return getFlowsUiStateSnapshot().flowYamlPreview !== null;
}
