## MODIFIED Requirements

### Requirement: Heartbeat acknowledgment handling
The bridge extension SHALL treat incoming `heartbeat_ack` messages as server liveness signals. These messages SHALL be processed by the `ConnectionManager`'s `onMessage` handler, which updates the `lastMessageAt` timestamp used by the watchdog timer.

#### Scenario: Heartbeat ack received
- **WHEN** the bridge receives a `{ type: "heartbeat_ack" }` message from the server
- **THEN** the `ConnectionManager`'s `lastMessageAt` timestamp SHALL be updated
- **AND** no further processing SHALL be required (the ack is consumed by the connection layer)

#### Scenario: Heartbeat sent triggers ack
- **WHEN** the bridge sends a `session_heartbeat` to the server
- **THEN** the server SHALL respond with `heartbeat_ack`
- **AND** the bridge SHALL receive it within the normal WebSocket delivery time
