## ADDED Requirements

### Requirement: List pi sessions via bridge
The bridge extension SHALL handle `list_sessions` messages by calling pi's `SessionManager.list(cwd)` static method and returning the results as a `sessions_list` message.

#### Scenario: List sessions for a directory
- **WHEN** the bridge receives a `list_sessions` message with a `cwd` field
- **THEN** it SHALL call `SessionManager.list(cwd)` and return a `sessions_list` message with session metadata for all sessions in that directory

#### Scenario: Session metadata includes required fields
- **WHEN** `SessionManager.list(cwd)` returns session info
- **THEN** each entry in the `sessions_list` SHALL include: `id`, `path` (JSONL file path), `cwd`, `name` (if set), `parentSessionPath` (if forked), `created`, `modified`, `messageCount`, and `firstMessage`

#### Scenario: No sessions found
- **WHEN** `SessionManager.list(cwd)` returns an empty array
- **THEN** the bridge SHALL return a `sessions_list` with an empty `sessions` array

#### Scenario: SessionManager.list fails
- **WHEN** `SessionManager.list(cwd)` throws an error
- **THEN** the bridge SHALL return a `sessions_list` with an empty `sessions` array (graceful degradation)

### Requirement: Server creates records for undiscovered sessions
When the server receives a `sessions_list` from the bridge, it SHALL create SQLite session records for any pi sessions not already in the database.

#### Scenario: New session discovered from pi listing
- **WHEN** the `sessions_list` contains a session ID not present in the dashboard's sessions table
- **THEN** the server SHALL insert a new record with: `id` = pi session ID, `cwd` from listing, `name` from listing, `session_file` = path from listing, `status = "ended"`, `hidden = true`, `started_at` = created timestamp, `ended_at` = modified timestamp

#### Scenario: Existing session in listing
- **WHEN** the `sessions_list` contains a session ID already present in the sessions table
- **THEN** the server SHALL NOT overwrite the existing record (dashboard data takes precedence)

#### Scenario: Session file path updated for existing session
- **WHEN** the `sessions_list` contains a known session ID but with a different `session_file`
- **THEN** the server SHALL update the `session_file` and `session_dir` fields (file may have been moved)

### Requirement: Browser requests session listing
The browser SHALL be able to request a session listing for a specific cwd. The server SHALL forward the request to any connected bridge for that cwd and return the results.

#### Scenario: Browser requests session list
- **WHEN** the browser sends a `list_sessions` message with a `cwd`
- **THEN** the server SHALL forward the request to a connected bridge extension whose session cwd matches, and relay the `sessions_list` response back to the browser

#### Scenario: No bridge connected for cwd
- **WHEN** the browser requests sessions for a cwd but no bridge is connected for that directory
- **THEN** the server SHALL return only sessions already in SQLite for that cwd (filtered by cwd prefix match)
