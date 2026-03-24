## ADDED Requirements

### Requirement: Session history sync on connect
After completing the `session_register` handshake, the bridge extension SHALL call `SessionManager.list(process.cwd())` to retrieve local session history and send a `session_history_sync` message to the dashboard server. This SHALL occur once per connection (including reconnections). The call SHALL be non-blocking and errors SHALL be silently caught to avoid disrupting normal bridge operation.

#### Scenario: Bridge syncs history after registration
- **WHEN** the bridge extension successfully sends `session_register` to the server
- **THEN** it SHALL asynchronously call `SessionManager.list(process.cwd())` and send a `session_history_sync` message with the results

#### Scenario: Reconnection triggers history sync
- **WHEN** the bridge extension reconnects after a connection drop
- **THEN** it SHALL send `session_history_sync` again as part of the state sync flow

#### Scenario: History sync error is non-fatal
- **WHEN** `SessionManager.list()` throws an error (e.g., filesystem permission issue)
- **THEN** the bridge SHALL catch the error silently and continue normal operation without sending `session_history_sync`
