## ADDED Requirements

### Requirement: Plugin context exposes per-session event stream

`PluginContextValue` SHALL provide a hook
`useSessionEvents(sessionId: string): readonly DashboardEvent[]` that
returns every event observed for the given session in arrival order.
The hook SHALL be reactive: when a new event arrives for the
subscribed session, the consuming component SHALL re-render with the
extended event list.

The returned array SHALL be referentially stable across renders that
do not change the event list. Plugins MAY use it as a `useMemo`
dependency to recompute derived state only when new events arrive.

The dashboard shell SHALL accumulate per-session events in a parallel
in-memory store sourced from the existing `case "event"` handler in
`useMessageHandler.ts`. The accumulator SHALL be initialized empty on
`session_register`, appended to on each `event`, and cleared on
session unregister.

#### Scenario: Plugin derives state from events

- **GIVEN** a plugin contribution is rendered for session `S`
- **AND** events `[e1, e2, e3]` have been received for session `S`
- **WHEN** the contribution calls `useSessionEvents("S")`
- **THEN** the hook SHALL return an array containing `[e1, e2, e3]` in
  arrival order
- **AND** the array reference SHALL be the same on subsequent renders
  until a new event arrives

#### Scenario: New event triggers re-render

- **GIVEN** a plugin contribution rendered with `useSessionEvents("S")`
  returning `[e1, e2]`
- **WHEN** event `e3` arrives via the `case "event"` handler
- **THEN** the contribution SHALL re-render
- **AND** the hook SHALL return `[e1, e2, e3]` on the new render

#### Scenario: Hook is per-session

- **GIVEN** events `[a1, a2]` for session `A` and `[b1]` for session `B`
- **WHEN** a contribution calls `useSessionEvents("A")`
- **THEN** the hook SHALL return only `[a1, a2]`
- **AND** SHALL NOT include any event from session `B`

### Requirement: Plugin claims SHALL support an optional route field

`PluginClaim` SHALL include an optional `route?: string` field. The
field is consumed by `content-view` slot consumers to filter
competing claims. Other slots MAY use it but it has no defined
semantic outside `content-view`.

The vite-plugin manifest validator SHALL accept the field as a
free-form string. No name-resolution or export-existence check is
performed against the field's value.

#### Scenario: ContentViewSlot filters claims by route

- **GIVEN** two `content-view` claims registered:
  - Claim A: `{ component: "FlowAgentDetail", route: "flow-agent-detail" }`
  - Claim B: `{ component: "FlowArchitectDetail", route: "flow-architect-detail" }`
- **WHEN** the shell mounts `<ContentViewSlot>` with the active route
  `"flow-agent-detail"`
- **THEN** only Claim A SHALL render
- **AND** Claim B SHALL NOT render

#### Scenario: Claims without route match the empty route

- **GIVEN** a `content-view` claim without a `route` field
- **WHEN** the shell mounts `<ContentViewSlot>` with no active route
- **THEN** the claim SHALL be eligible to render (subject to existing
  `one-active` priority resolution)

#### Scenario: Multiple claims with the same route resolve by priority

- **GIVEN** two `content-view` claims with `route: "spec-detail"`,
  one from plugin priority 100 and one from plugin priority 200
- **WHEN** the shell mounts `<ContentViewSlot>` with active route
  `"spec-detail"`
- **THEN** only the higher-priority plugin's claim SHALL render
  (existing slot resolution applies)

