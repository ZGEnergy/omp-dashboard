## ADDED Requirements

### Requirement: Subscribe to all pi core event types
The bridge extension SHALL subscribe to all pi core event types defined in the extension API, with the exception of `context` and `before_provider_request` which are excluded due to payload size.

The full subscription list SHALL include:
- Already handled with enrichment: `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `session_compact`, `model_select`
- New pass-through types: `tool_call`, `tool_result`, `user_bash`, `input`, `before_agent_start`, `resources_discover`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_before_tree`, `session_tree`

#### Scenario: Known enriched events retain special handling
- **WHEN** a `model_select` event fires
- **THEN** the bridge SHALL enrich it with `thinkingLevel` and forward as `event_forward` (server extracts model/thinkingLevel via `extractSessionUpdates`)

#### Scenario: New pass-through events are forwarded
- **WHEN** a `tool_call` event fires from the pi extension runner
- **THEN** the bridge SHALL forward it as an `event_forward` message with `eventType: "tool_call"` and the serialized event data

#### Scenario: Excluded events are not subscribed
- **WHEN** the bridge initializes
- **THEN** it SHALL NOT subscribe to `context` or `before_provider_request` events

### Requirement: Control events handled specially and not forwarded as event_forward
The following pi core events have dedicated handlers in the bridge that produce their own protocol messages (e.g., `session_register`, disconnect). They SHALL NOT be forwarded as `event_forward` messages to avoid redundant data:

- `session_start` — triggers session registration (`session_register` protocol message), context caching, model/git info sync, and flow event wiring. Produces its own protocol flow.
- `session_switch` — updates the bridge's `sessionId` and sends a new `session_register`. The old session is implicitly replaced.
- `session_fork` — same as `session_switch`: updates `sessionId`, sends `session_register`.
- `session_shutdown` — triggers WebSocket disconnect and cleanup. No `event_forward` needed; the server detects disconnection via the WebSocket close.

These events are fully handled by their dedicated `pi.on()` callbacks and are excluded from both the enriched and pass-through subscription lists.

#### Scenario: session_start not forwarded as event_forward
- **WHEN** a `session_start` event fires
- **THEN** the bridge SHALL handle it via its dedicated callback (session registration) and SHALL NOT send an `event_forward` message

#### Scenario: session_shutdown not forwarded as event_forward
- **WHEN** a `session_shutdown` event fires
- **THEN** the bridge SHALL handle it via its dedicated callback (disconnect/cleanup) and SHALL NOT send an `event_forward` message

### Requirement: EventBus catch-all via emit intercept
The bridge extension SHALL wrap `pi.events.emit` to intercept all EventBus emissions. For every emission, the bridge SHALL forward an `event_forward` message to the dashboard server before calling the original `emit`.

The intercept SHALL apply a rename mapping for known channels:
- `flow:flow-started` → `flow_started`
- `flow:agent-started` → `flow_agent_started`
- `flow:agent-complete` → `flow_agent_complete`
- `flow:subagent-tool-call` → `flow_tool_call`
- `flow:subagent-tool-result` → `flow_tool_result`
- `flow:assistant-text` → `flow_assistant_text`
- `flow:thinking-text` → `flow_thinking_text`
- `flow:loop-iteration` → `flow_loop_iteration`
- `flow:auto-decision` → `flow_auto_decision`
- `flow:complete` → `flow_complete`
- `subagents:created` → `subagent_created`
- `subagents:started` → `subagent_started`
- `subagents:completed` → `subagent_completed`
- `subagents:failed` → `subagent_failed`

For unknown channels (not in the mapping), the channel name SHALL be used directly as the `eventType`.

#### Scenario: Known flow event forwarded with mapped name
- **WHEN** `pi.events.emit("flow:flow-started", data)` is called
- **THEN** the bridge SHALL forward an `event_forward` with `eventType: "flow_started"`

#### Scenario: Known subagent event forwarded with mapped name
- **WHEN** `pi.events.emit("subagents:created", data)` is called
- **THEN** the bridge SHALL forward an `event_forward` with `eventType: "subagent_created"`

#### Scenario: Unknown custom extension event forwarded with channel name
- **WHEN** `pi.events.emit("my-extension:custom-event", data)` is called
- **THEN** the bridge SHALL forward an `event_forward` with `eventType: "my-extension:custom-event"`

#### Scenario: Events not forwarded before session is ready
- **WHEN** an EventBus emission occurs before `sessionReady` is true
- **THEN** the bridge SHALL NOT forward it (original emit still called)

#### Scenario: Original emit always called
- **WHEN** the bridge intercepts an EventBus emission
- **THEN** the original `emit` function SHALL always be called, regardless of forwarding success

### Requirement: EventBus intercept installed once at extension init
The `pi.events.emit` wrap SHALL be installed once during extension initialization (not after `session_start`). The forwarding guard (`sessionReady` check) ensures no events are forwarded prematurely.

#### Scenario: Intercept installed at init
- **WHEN** the bridge extension loads
- **THEN** `pi.events.emit` SHALL be wrapped immediately if `pi.events` is available

#### Scenario: Cleanup restores original emit
- **WHEN** the bridge extension cleans up (reload/shutdown)
- **THEN** `pi.events.emit` SHALL be restored to the original function
