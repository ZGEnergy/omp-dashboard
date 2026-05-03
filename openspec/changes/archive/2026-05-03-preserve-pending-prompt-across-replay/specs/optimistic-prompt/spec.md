## ADDED Requirements

### Requirement: Pending prompt survives client-side reset and replay
`pendingPrompt` SHALL NOT be cleared by `session_state_reset` or by the full-replay reset branch of `event_replay`. Only reducer event handlers (e.g. user `message_start`, `agent_start`), the safety timeout, and explicit user cancel SHALL clear `pendingPrompt`.

#### Scenario: session_state_reset preserves pendingPrompt
- **WHEN** the client receives `session_state_reset` for a session whose `SessionState.pendingPrompt` is set
- **THEN** the session's other state SHALL be reset to `createInitialState()`
- **AND** `pendingPrompt` SHALL be carried over unchanged into the new state

#### Scenario: event_replay full-reset preserves pendingPrompt
- **WHEN** the client receives `event_replay` with `shouldReset === true` for a session whose `SessionState.pendingPrompt` is set
- **THEN** the session's other state SHALL be reset to `createInitialState()` before applying the replayed events
- **AND** `pendingPrompt` SHALL be carried over unchanged into the new state, then the replayed events SHALL be reduced on top of it

#### Scenario: Auto-resume of ended session keeps the optimistic bubble visible
- **WHEN** the user sends a prompt to an ended session and the server triggers auto-resume (per `auto-resume-on-prompt`)
- **AND** the bridge re-registers, causing the server to broadcast `session_state_reset` and/or `event_replay`
- **THEN** the optimistic user-message bubble SHALL remain visible across the reset/replay
- **AND** the bubble SHALL only disappear when the bridge emits the corresponding user `message_start` event (or one of the existing clear paths fires)

#### Scenario: Reducer-driven clear paths still fire after replay
- **WHEN** `pendingPrompt` survives a reset/replay and the bridge subsequently emits the user `message_start` (or `agent_start`) event
- **THEN** the reducer SHALL clear `pendingPrompt` exactly as it does today

#### Scenario: Safety timeout still fires after replay
- **WHEN** `pendingPrompt` survives a reset/replay and 30 seconds elapse without confirmation
- **THEN** the existing `usePendingPromptTimeout` safety path SHALL clear `pendingPrompt` and surface the existing error
