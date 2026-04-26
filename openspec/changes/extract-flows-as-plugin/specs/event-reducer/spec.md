## ADDED Requirements

### Requirement: Reducer slice registration for plugins
The reducer SHALL accept slice registrations from plugins via `pluginContext.registerReducerSlice(eventTypes, reducer)`. Each slice is a tuple of `(eventTypes: string[], reducer: (state: SessionState, event: DashboardEvent) → SessionState)`. The core reducer's switch statement SHALL handle every non-plugin event type unchanged; events not matched by the switch SHALL be dispatched to the first registered slice whose `eventTypes` list includes the event's type. Slices are pure functions with the same signature as the core reducer.

#### Scenario: Plugin registers reducer slice
- **WHEN** a plugin's client entry calls `pluginContext.registerReducerSlice(["flow_started", "flow_complete"], flowReducerSlice)` during initialization
- **THEN** subsequent `flow_started` and `flow_complete` events SHALL be processed by `flowReducerSlice` and the returned `SessionState` SHALL be applied as the new state

#### Scenario: Event with no matching slice is silently dropped
- **WHEN** an event with type `flow_started` arrives and no plugin has registered a slice covering `flow_started`
- **THEN** the reducer SHALL return the input state unchanged (no error, no state mutation)

#### Scenario: Duplicate slice registration is rejected at load time
- **WHEN** two plugins both register slices that include the same event type in their `eventTypes` arrays
- **THEN** the plugin loader SHALL fail validation at startup with an error naming the conflicting plugins and event type, before either plugin is mounted

#### Scenario: Slice registration order is deterministic
- **WHEN** multiple plugins register non-overlapping slices
- **THEN** their registration order SHALL match the manifest discovery order produced by the plugin loader, and the same input shall always produce the same output across runs

## REMOVED Requirements

### Requirement: Flow state tracked in SessionState
**Reason**: Flow state structure moves into the `flows-plugin` package. Although `SessionState.flowState` remains as a typed field on the central `SessionState` (per design.md Decision 1), the *requirement* that the core reducer owns its lifecycle is removed. The plugin's reducer slice now owns initialization and updates.
**Migration**: Plugins consuming `flowState` continue to read it via `usePluginContext().useSessionState(sessionId).flowState`. The field's type definition stays in `packages/shared/src/types.ts` so no type-import paths change.

### Requirement: Reducer processes flow_started event
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: The `flows-plugin` client entry registers a slice handling `flow_started`; behavior is preserved 1:1.

### Requirement: Reducer processes flow_agent_started event
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice as `flow_started`.

### Requirement: Reducer processes flow_agent_complete event
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice.

### Requirement: Reducer processes flow tool call events
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice (covers `flow_tool_call` and `flow_tool_result`).

### Requirement: Reducer processes flow_assistant_text and flow_thinking_text
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice.

### Requirement: Reducer processes flow_loop_iteration event
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice.

### Requirement: Reducer processes flow_complete event
**Reason**: Moved to `flows-plugin` reducer slice.
**Migration**: Handled by the same slice; `FlowSummary` continues to read `flowState.flowResult` after completion.
