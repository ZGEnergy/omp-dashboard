## ADDED Requirements

### Requirement: Bridge captures flow lifecycle events from pi.events
The bridge extension SHALL listen to all `flow:*` events on `pi.events` and forward them as `event_forward` messages to the dashboard server with flow-specific `eventType` values.

The following pi.events → eventType mappings SHALL be used:
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

#### Scenario: Flow started event forwarded
- **WHEN** pi-flows emits `flow:flow-started` with `{ flowName, task, steps, description, maxConcurrent }`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_started"` and the full event data

#### Scenario: Agent started event forwarded
- **WHEN** pi-flows emits `flow:agent-started` with `{ agentName, stepId, config }`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_agent_started"` and the event data

#### Scenario: Agent complete event forwarded
- **WHEN** pi-flows emits `flow:agent-complete` with `{ agentName, stepId, result }`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_agent_complete"` and the event data

#### Scenario: Tool call event forwarded
- **WHEN** pi-flows emits `flow:subagent-tool-call` with `{ agentName, toolName, input }`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_tool_call"` and the event data

#### Scenario: Tool result event forwarded
- **WHEN** pi-flows emits `flow:subagent-tool-result` with `{ agentName, toolName, output, isError }`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_tool_result"` and the event data

#### Scenario: Flow complete event forwarded
- **WHEN** pi-flows emits `flow:complete` with the full `FlowResult`
- **THEN** the bridge SHALL send an `event_forward` message with `eventType: "flow_complete"` and the result data

#### Scenario: Events only forwarded after session ready
- **WHEN** a `flow:*` event fires before `sessionReady` is true
- **THEN** the bridge SHALL NOT forward the event

### Requirement: Bridge sends autonomous mode state with flow events
The bridge SHALL include the current autonomous mode state when forwarding `flow_started` events. The bridge SHALL listen for autonomous mode toggle events and forward state changes.

#### Scenario: Autonomous mode included in flow started
- **WHEN** a `flow_started` event is forwarded
- **THEN** the event data SHALL include an `autonomousMode: boolean` field reflecting the current state
