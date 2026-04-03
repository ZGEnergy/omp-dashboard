## ADDED Requirements

### Requirement: Log session registration
The pi-gateway SHALL log when a session is registered via `session_register` message.

#### Scenario: Session registers successfully
- **WHEN** the server processes a `session_register` message
- **THEN** it SHALL log `[gateway] session registered: <sessionId> cwd=<cwd>` to stderr

### Requirement: Log session unregistration with reason
The pi-gateway SHALL log when a session is unregistered, including the reason for unregistration.

#### Scenario: Explicit unregister from bridge
- **WHEN** the server processes a `session_unregister` message
- **THEN** it SHALL log `[gateway] session unregistered: <sessionId> (explicit)` to stderr

#### Scenario: Heartbeat timeout
- **WHEN** the heartbeat timer fires and the session is unregistered
- **THEN** it SHALL log `[gateway] session timed out: <sessionId> (no heartbeat for 45s)` to stderr

#### Scenario: Sleep recovery failure
- **WHEN** the sleep-retry heartbeat timer fires and the session is unregistered
- **THEN** it SHALL log `[gateway] session timed out: <sessionId> (sleep recovery failed)` to stderr

#### Scenario: Ping timeout
- **WHEN** a connection is terminated due to WS ping timeout
- **THEN** it SHALL log `[gateway] connection dead (ping timeout): <sessionId>` to stderr

### Requirement: Log WebSocket connection close
The pi-gateway SHALL log when a bridge WebSocket connection closes.

#### Scenario: Connection closes
- **WHEN** a bridge WebSocket connection fires the `close` event
- **THEN** it SHALL log `[gateway] connection closed: <sessionId>` to stderr
