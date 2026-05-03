## ADDED Requirements

### Requirement: Pending prompt state
`SessionState` SHALL include a `pendingPrompt` field (`{ text: string; images?: ChatImage[] } | undefined`) that represents a prompt sent by the user but not yet confirmed by the server.

#### Scenario: Set pending prompt on send
- **WHEN** the user sends a prompt via the input
- **THEN** `pendingPrompt` SHALL be set with the sent text and any attached images

#### Scenario: Clear pending prompt on server confirmation
- **WHEN** a `message_start` event with role "user" is received by the reducer
- **THEN** `pendingPrompt` SHALL be cleared to `undefined`

#### Scenario: Clear pending prompt on agent start
- **WHEN** an `agent_start` event is received by the reducer
- **THEN** `pendingPrompt` SHALL be cleared to `undefined`

### Requirement: Optimistic user card rendering
When `pendingPrompt` exists, the chat view SHALL render an optimistic user message card at the bottom of the message list, styled identically to a normal user card but with an animated spinner icon.

#### Scenario: Optimistic card appears immediately
- **WHEN** a prompt is sent and `pendingPrompt` is set
- **THEN** an optimistic user card SHALL appear at the bottom of the chat with the prompt text and an `animate-spin` spinner icon

#### Scenario: Optimistic card shows images
- **WHEN** `pendingPrompt` includes images
- **THEN** the optimistic card SHALL render image attachments the same as a normal user card

#### Scenario: Optimistic card replaced by server card
- **WHEN** the server's `message_start` (role: "user") event arrives
- **THEN** the optimistic card SHALL disappear and the server-sourced user card SHALL take its place

### Requirement: Input disabled during pending
The command input SHALL be disabled while `pendingPrompt` exists, preventing duplicate sends.

#### Scenario: Input disabled after send
- **WHEN** the user sends a prompt and `pendingPrompt` is set
- **THEN** the text input and send button SHALL be disabled

#### Scenario: Input re-enabled after confirmation
- **WHEN** `pendingPrompt` is cleared (by server event or cancellation)
- **THEN** the text input and send button SHALL be re-enabled

### Requirement: Cancel pending prompt
The user SHALL be able to cancel a pending prompt, which removes the optimistic card, sends an abort to the bridge, and re-enables the input.

#### Scenario: Cancel via Stop button
- **WHEN** the user clicks the Stop button while `pendingPrompt` exists
- **THEN** `pendingPrompt` SHALL be cleared, the optimistic card SHALL be removed, an `abort` message SHALL be sent to the server, and the input SHALL be re-enabled

#### Scenario: Cancel via Escape key
- **WHEN** the user presses Escape while `pendingPrompt` exists and the input is focused
- **THEN** the same cancel behavior as the Stop button SHALL occur

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
