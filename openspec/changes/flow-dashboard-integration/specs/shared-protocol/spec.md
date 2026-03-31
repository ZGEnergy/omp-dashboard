## ADDED Requirements

### Requirement: Flow control message type in extension protocol
The extension protocol SHALL define a `flow_control` message type from server to extension for flow-specific commands.

The message SHALL have the shape:
```
{ type: "flow_control", sessionId: string, action: "abort" | "toggle_autonomous" }
```

#### Scenario: Flow control message in ServerToExtensionMessage union
- **WHEN** the protocol types are compiled
- **THEN** `FlowControlExtensionMessage` SHALL be a valid member of `ServerToExtensionMessage`

### Requirement: Flow event types recognized in event forwarding
The event forwarding pipeline SHALL pass through flow-specific `eventType` values without modification: `flow_started`, `flow_agent_started`, `flow_agent_complete`, `flow_tool_call`, `flow_tool_result`, `flow_assistant_text`, `flow_thinking_text`, `flow_loop_iteration`, `flow_auto_decision`, `flow_complete`.

#### Scenario: Flow events stored and broadcast
- **WHEN** an `event_forward` message has `eventType` starting with `flow_`
- **THEN** the server SHALL store it in the memory event store and broadcast it to subscribed browsers as an `EventMessage`

### Requirement: Flow control message type in browser protocol
The browser protocol SHALL define a `flow_control` message type from browser to server.

The message SHALL have the shape:
```
{ type: "flow_control", sessionId: string, action: "abort" | "toggle_autonomous" }
```

#### Scenario: Flow control in BrowserToServerMessage union
- **WHEN** the protocol types are compiled
- **THEN** `FlowControlBrowserMessage` SHALL be a valid member of `BrowserToServerMessage`
