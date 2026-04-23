## ADDED Requirements

### Requirement: Thinking level updates propagate to both UI surfaces

When the bridge sends a `model_update` message (via `modelTracker.sendModelUpdateIfChanged` after `set_thinking_level`), the server SHALL patch both the `DashboardSession` registry (observed by session cards and the session header) AND the browser-side `sessionStates[sessionId]` state (observed by the bottom StatusBar selector), so the thinking level displayed in every UI surface stays consistent.

Protocol-level responsibility: the server's `model_update` handler in `event-wiring.ts` continues to update `sessionManager` and broadcast `session_updated`. The client's `session_updated` handler in `useMessageHandler.ts` SHALL, in addition to patching the `sessions` Map, mirror `thinkingLevel` and `model` fields from `msg.updates` into `sessionStates[msg.sessionId]` (creating a fresh `SessionState` via `createInitialState()` when the session has no state yet).

Rationale: the StatusBar component reads `selectedState.thinkingLevel ?? selectedSession?.thinkingLevel`, preferring event-reducer state over the DashboardSession. Without the mirror, the server-pushed thinking level updates `sessions[id].thinkingLevel` but not `sessionStates[id].thinkingLevel`, causing the StatusBar to silently fall back to a stale value while the SessionCard refreshes correctly.

Only `thinkingLevel` and `model` are mirrored; other `DashboardSession`-only fields (`name`, `cost`, `contextTokens`, `contextWindow`, etc.) stay unmirrored because no event-reducer-driven UI surface reads them.

#### Scenario: StatusBar and SessionCard update together when user clicks a thinking level

- **WHEN** the user clicks `medium` in the bottom StatusBar's thinking level dropdown on a session that previously displayed `off`
- **AND** the bridge receives `set_thinking_level`, calls `pi.setThinkingLevel("medium")`, and sends `model_update` with `thinkingLevel: "medium"` back to the server
- **AND** the server patches `DashboardSession.thinkingLevel = "medium"` and broadcasts `session_updated`
- **THEN** the client's `session_updated` handler SHALL update both `sessions[sessionId].thinkingLevel` AND `sessionStates[sessionId].thinkingLevel` to `"medium"`
- **AND** the SessionCard's `{session.thinkingLevel}` text SHALL read `medium`
- **AND** the StatusBar's `ThinkingLevelSelector.current` prop (fed by `selectedState.thinkingLevel`) SHALL also read `medium`
- **AND** neither surface SHALL revert after the round-trip settles

#### Scenario: Model change propagates to both surfaces

- **WHEN** the user selects a different model from the StatusBar ModelSelector
- **AND** the server broadcasts `session_updated` with `updates: { model: "proxy/cc/claude-opus-4-7" }`
- **THEN** both `sessions[sessionId].model` AND `sessionStates[sessionId].model` SHALL be updated
- **AND** the SessionCard's model label AND the StatusBar's ModelSelector current value SHALL both reflect the new selection

#### Scenario: Non-model/non-thinkingLevel session updates do not disturb sessionStates

- **WHEN** the server broadcasts `session_updated` with `updates: { name: "new session name" }` (no `model` / `thinkingLevel`)
- **THEN** the client SHALL update `sessions[sessionId].name` only
- **AND** `sessionStates[sessionId]` SHALL remain unchanged (no spurious `createInitialState()` allocation, no accidental reset of `messages` / `status` / `contextUsage`)

#### Scenario: Mirror creates initial state when session has no prior state

- **WHEN** `session_updated` arrives for a sessionId that has no entry in `sessionStates` yet
- **AND** the update includes `thinkingLevel` or `model`
- **THEN** the client SHALL call `createInitialState()` to seed the state map before applying the mirror
- **AND** the other `SessionState` fields (`messages`, `status`, `events`, …) SHALL be set to their initial empty values
