## REMOVED Requirements

### Requirement: DashboardSession SHALL carry flow-specific scalar fields

**Reason for removal:** Flow-specific fields on a generic
`DashboardSession` type were architectural contamination. Plugins
that need event-derived state SHALL use `useSessionEvents` (per
`dashboard-plugin-loader`) instead. The four scalars
(`activeFlowName`, `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`)
SHALL be removed from the `DashboardSession` interface and from the
server's event-status extraction. flows-plugin's session-card badge
recomputes the equivalent values inside the plugin from event-derived
state.

The `FlowState` and `ArchitectState` type exports in
`packages/shared/src/types.ts` SHALL remain because they are the
shared type contract for the plugin's `/reducer` workspace export.
The exports remain unchanged; only `DashboardSession`'s flow-specific
fields are removed.

## ADDED Requirements

### Requirement: Dashboard shell SHALL contain zero flow references

The dashboard shell source code SHALL NOT contain any reference to
flows. The substring `flow` (case-insensitive) SHALL not appear in any
file under:

- `packages/shared/src/`
- `packages/server/src/`
- `packages/client/src/`

except for an explicit allow-list:

- `packages/shared/src/types.ts` MAY export `FlowState`,
  `ArchitectState`, `FlowStatus`, `FlowAgentStatus`,
  `FlowAgentState`, `ArchitectPhase`, `ArchitectAgentEntry`,
  `ArchitectDagStep`, `ArchitectParsedFlow`, `ArchitectPrompt`,
  `FlowDetailEntry`, `FlowRecentTool` (the type contract for the
  plugin's `/reducer` workspace export).
- Test files under `__tests__/` MAY reference flow types if they
  exist solely to assert these allow-list exports.

This invariant SHALL be enforced by a repo-lint test
`packages/shared/src/__tests__/no-flow-references-in-shell.test.ts`
that scans the listed source trees and fails CI on any unallowed
match.

#### Scenario: Lint catches new flow reference in shell

- **WHEN** any file under `packages/{shared,server,client}/src/`
  (excluding the allow-list) introduces the substring `flow` (case-
  insensitive)
- **THEN** the repo-lint test SHALL fail CI
- **AND** the failure message SHALL name the file, line, and the
  matching token

#### Scenario: Lint allows shared FlowState type export

- **WHEN** `packages/shared/src/types.ts` exports `FlowState`
- **THEN** the repo-lint test SHALL NOT flag this export

#### Scenario: Plugin source is exempt

- **WHEN** files under `packages/flows-plugin/src/` reference flow
  types and components
- **THEN** the repo-lint test SHALL NOT scan those files

### Requirement: Shell SHALL render all flow content via plugin slot claims

The shell SHALL NOT directly import or render any `Flow*` component.
All flow rendering SHALL go through slot consumers populated by
`flows-plugin` claims. Specifically:

- `FlowActivityBadge` rendered via `session-card-badge` slot.
- `SessionFlowActions` rendered via `session-card-action-bar` slot.
- `FlowDashboard` and `FlowArchitect` rendered via
  `content-header-sticky` slot.
- `FlowAgentDetail`, `FlowArchitectDetail`, `FlowYamlPreview`
  rendered via `content-view` slot, each with a distinct `route`.
- `FlowSummary` rendered via `content-inline-footer` slot.
- Slash-command wrappers (`/flows`, `/flows:new`, `/flows:edit`,
  `/flows:delete`) rendered via `command-route` slot.

The shell SHALL NOT pass flow-specific props to any slot consumer.
Slot consumers receive the standard prop contract for their slot
(`{ session, pluginContext }` or
`{ session, routeParams, onClose, pluginContext }` for content-view).

#### Scenario: Single content-header-sticky claim renders FlowArchitect

- **GIVEN** a session whose event stream has produced a non-null
  `architectState` inside `flows-plugin`'s internal context
- **WHEN** the shell renders `<ContentHeaderStickySlot session={...}>`
- **THEN** `<FlowArchitect>` SHALL render exactly once via the slot
  contribution
- **AND** the rendering SHALL not require any flow-specific props from
  the shell

#### Scenario: FlowArchitect collapses across selection states

- **GIVEN** the user is viewing a session with both `architectState`
  and `flowState` set
- **WHEN** the user transitions through architect-detail, flow-detail,
  and default content views
- **THEN** `<FlowArchitect>` SHALL be rendered exactly once at any
  point in time
- **AND** dismissal callbacks SHALL be uniform across all selection
  states (handled by the plugin's internal UI-state context)

#### Scenario: FlowDashboard collapses across selection states

- **GIVEN** the user is viewing a session with `flowState` set
- **WHEN** the user transitions through flow-detail and default views
- **THEN** `<FlowDashboard>` SHALL be rendered exactly once at any
  point in time
