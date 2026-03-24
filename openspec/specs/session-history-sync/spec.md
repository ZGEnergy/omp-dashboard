## Purpose

Syncs local pi session history from the bridge extension to the dashboard server on connect, enabling visibility into past sessions that occurred before the dashboard was running.

## ADDED Requirements

### Requirement: Bridge sends local session history on connect
The bridge extension SHALL, after sending `session_register` on connect, call `SessionManager.list(cwd)` from `@mariozechner/pi-coding-agent` to retrieve all local sessions for the current working directory. It SHALL then send a `session_history_sync` message to the server containing metadata for each session.

#### Scenario: Bridge connects with local session history
- **WHEN** the bridge extension connects to the dashboard server and completes `session_register`
- **THEN** it SHALL call `SessionManager.list(process.cwd())` and send a `session_history_sync` message with an array of session metadata objects containing id, cwd, name, startedAt, firstMessage, sessionFile, and sessionDir

#### Scenario: No local sessions exist
- **WHEN** `SessionManager.list(cwd)` returns an empty array
- **THEN** the bridge SHALL NOT send a `session_history_sync` message

#### Scenario: SessionManager.list fails
- **WHEN** `SessionManager.list(cwd)` throws an error
- **THEN** the bridge SHALL silently ignore the error and continue normal operation

### Requirement: Server deduplicates and inserts historical sessions
The dashboard server SHALL, upon receiving a `session_history_sync` message, check each session ID against the database. Sessions not already present SHALL be inserted with status `ended`, `hidden=true`, and source defaulting to `"tui"`. Sessions already in the database SHALL be skipped.

#### Scenario: New historical session received
- **WHEN** the server receives a `session_history_sync` containing a session ID not in the database
- **THEN** it SHALL insert the session with status `"ended"`, `hidden=true`, source `"tui"`, and the provided metadata (startedAt, name, firstMessage, sessionFile, sessionDir)

#### Scenario: Duplicate session received
- **WHEN** the server receives a `session_history_sync` containing a session ID already in the database
- **THEN** it SHALL skip that session without modification

#### Scenario: Browser notification of new historical sessions
- **WHEN** the server inserts one or more historical sessions
- **THEN** it SHALL broadcast `session_added` events to all connected browser clients for each newly inserted session
