## ADDED Requirements

### Requirement: Bridge listens to flow events on pi.events
The bridge extension SHALL register listeners on `pi.events` for all `flow:*` event names and forward them as `event_forward` messages using the mapped `eventType` values defined in the flow-event-bridge spec.

#### Scenario: Flow event listeners registered at activation
- **WHEN** the bridge extension activates and `pi.events` is available
- **THEN** listeners SHALL be registered for `flow:flow-started`, `flow:agent-started`, `flow:agent-complete`, `flow:subagent-tool-call`, `flow:subagent-tool-result`, `flow:assistant-text`, `flow:thinking-text`, `flow:loop-iteration`, `flow:auto-decision`, `flow:complete`

#### Scenario: pi.events not available
- **WHEN** `pi.events` is not available (pi-flows not installed)
- **THEN** the bridge SHALL continue to function normally without flow event forwarding

### Requirement: Bridge handles flow_control messages from server
The bridge SHALL handle incoming `flow_control` messages from the server. For `action: "abort"`, it SHALL call the existing abort mechanism. For `action: "toggle_autonomous"`, it SHALL emit a `flow:toggle-autonomous` event on `pi.events` or call the pi-flows autonomous mode API.

#### Scenario: Abort flow control received
- **WHEN** the bridge receives `{ type: "flow_control", action: "abort" }`
- **THEN** the bridge SHALL trigger flow abort via the existing abort pipeline

#### Scenario: Toggle autonomous control received
- **WHEN** the bridge receives `{ type: "flow_control", action: "toggle_autonomous" }`
- **THEN** the bridge SHALL toggle autonomous mode in pi-flows
