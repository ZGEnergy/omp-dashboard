## ADDED Requirements

### Requirement: Visible sessions persist across restarts
The system SHALL persist metadata of all non-hidden sessions to `~/.pi/dashboard/sessions.json` so they survive server restarts.

#### Scenario: Server restarts with visible ended sessions
- **WHEN** the server has ended sessions that are not hidden and the server restarts
- **THEN** those sessions SHALL appear in the session list with `dataUnavailable: true`

#### Scenario: Server restarts with no sessions file
- **WHEN** the server starts and `sessions.json` does not exist
- **THEN** the server SHALL start with an empty session list (no errors)

#### Scenario: Active session bridge reconnects after restart
- **WHEN** a persisted session is restored on startup and the bridge later reconnects with the same session ID
- **THEN** the bridge registration SHALL overwrite the stale persisted entry with live data and clear `dataUnavailable`

### Requirement: Hidden sessions excluded from persistence
The system SHALL NOT persist sessions where `hidden` is `true`. When a session is hidden, it SHALL be removed from the persisted file on the next save cycle.

#### Scenario: Session is hidden
- **WHEN** a user hides a session
- **THEN** that session SHALL be removed from `sessions.json` on the next save

#### Scenario: Server restarts after all sessions hidden
- **WHEN** all sessions were hidden before restart
- **THEN** the session list SHALL be empty after restart

### Requirement: Debounced persistence writes
The system SHALL debounce writes to `sessions.json` to avoid excessive disk I/O. Pending writes SHALL be flushed on server shutdown.

#### Scenario: Rapid session updates
- **WHEN** multiple session updates occur within the debounce window (1 second)
- **THEN** only one write to `sessions.json` SHALL occur

#### Scenario: Server shutdown with pending changes
- **WHEN** the server shuts down with unsaved session changes
- **THEN** the system SHALL flush pending changes to disk before exit

### Requirement: Atomic file writes
The system SHALL use atomic write operations (write-to-temp + rename) to prevent corruption if the server crashes during a write.

#### Scenario: Server crashes during write
- **WHEN** the server crashes while writing `sessions.json`
- **THEN** the previous valid version of the file SHALL remain intact
