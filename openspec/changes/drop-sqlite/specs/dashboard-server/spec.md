## MODIFIED Requirements

### Requirement: Session registry
The dashboard server SHALL maintain an in-memory registry of all connected pi sessions, indexed by piSessionId. The registry SHALL be a pure in-memory `Map<string, DashboardSession>` with no SQLite backing.

On initialization, the session manager SHALL start with an empty Map. Sessions are populated as bridges connect and send `session_register` and `session_history_sync` messages. Hidden session IDs SHALL be loaded from `~/.pi/dashboard/state.json` on startup.

When a session is registered that appears in the hidden sessions list from `state.json`, it SHALL be marked as `hidden: true`.

When `update()` is called, changes SHALL be applied to the in-memory Map only. If the update includes `hidden` changes, the state file SHALL be updated (debounced).

#### Scenario: Session registration
- **WHEN** an extension sends `session_register`
- **THEN** the server SHALL add the session to the in-memory registry, match it to a workspace by cwd prefix, and broadcast `session_added` to browsers

#### Scenario: Session unregistration
- **WHEN** an extension sends `session_unregister` or disconnects
- **THEN** the server SHALL update the session status to `ended` in memory and broadcast `session_removed` to browsers

#### Scenario: Server restart with running pi sessions
- **WHEN** the dashboard server restarts while pi sessions are still running
- **THEN** extensions SHALL reconnect and re-register, and sessions SHALL appear fresh in the registry

#### Scenario: Server startup with empty registry
- **WHEN** the server starts
- **THEN** the session registry SHALL be empty. Sessions appear as bridges connect and send `session_register` and `session_history_sync` messages.

#### Scenario: Hidden sessions restored from state file
- **WHEN** the server starts and `state.json` contains hidden session IDs
- **THEN** when those sessions are registered by bridges, they SHALL be marked as `hidden: true`

#### Scenario: Stats update in memory
- **WHEN** `update()` is called with `tokensIn`, `tokensOut`, or `cost` values
- **THEN** the in-memory session record SHALL be updated (no disk persistence for stats)

#### Scenario: Git info update in memory
- **WHEN** `update()` is called with `gitBranch`, `gitBranchUrl`, `gitPrNumber`, or `gitPrUrl` values
- **THEN** the in-memory session record SHALL be updated (no disk persistence for git info)
