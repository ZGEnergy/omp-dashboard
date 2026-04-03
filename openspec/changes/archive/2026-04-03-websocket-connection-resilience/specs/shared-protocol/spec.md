## MODIFIED Requirements

### Requirement: Server to extension message types
The `ServerToExtensionMessage` union type SHALL include a `HeartbeatAckMessage` type for server-to-extension heartbeat acknowledgments.

#### Scenario: Heartbeat ack message defined
- **WHEN** the server receives a `session_heartbeat` from the bridge
- **THEN** it SHALL respond with `{ type: "heartbeat_ack" }` on the same WebSocket connection

#### Scenario: Type union includes heartbeat_ack
- **WHEN** a developer references `ServerToExtensionMessage`
- **THEN** the union SHALL include `HeartbeatAckMessage` with `type: "heartbeat_ack"`
