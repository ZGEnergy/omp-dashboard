## ADDED Requirements

### Requirement: Bridge sends process PID at registration
The bridge SHALL include `process.pid` (the Node.js process ID) in the `session_register` message sent to the server.

#### Scenario: PID included in registration
- **WHEN** the bridge sends a `session_register` message
- **THEN** the message SHALL include a `pid` field set to `process.pid`

#### Scenario: PID is a positive integer
- **WHEN** the bridge registers
- **THEN** the `pid` value SHALL be a positive integer
