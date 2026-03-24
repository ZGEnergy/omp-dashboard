## ADDED Requirements

### Requirement: Resume session (continue)
The dashboard SHALL support resuming a session by spawning a new pi instance with `pi --session <session-file-path>`. This continues the same JSONL file and reuses the same pi session ID.

#### Scenario: Resume ended session
- **WHEN** the user clicks "Resume" on an ended session that has a `sessionFile` stored
- **THEN** the server SHALL spawn pi with `pi --session <session-file-path>` in the session's cwd via tmux
- **AND** the spawned pi instance SHALL connect via the bridge with the same session ID, setting `hidden = false` and `status = "active"`

#### Scenario: Resume session without session file
- **WHEN** the user tries to resume a session that has no `sessionFile` stored (e.g., pre-migration session)
- **THEN** the server SHALL return an error indicating the session file is unknown

#### Scenario: Resume already active session
- **WHEN** the user tries to resume a session that is currently active
- **THEN** the server SHALL return an error indicating the session is already running

### Requirement: Fork session
The dashboard SHALL support forking a session by spawning a new pi instance with `pi --fork <session-file-path>`. This creates a new JSONL file with a new session ID.

#### Scenario: Fork ended session
- **WHEN** the user clicks "Fork" on an ended session that has a `sessionFile` stored
- **THEN** the server SHALL spawn pi with `pi --fork <session-file-path>` in the session's cwd via tmux
- **AND** pi SHALL create a new session with a new ID, which connects via the bridge as a new visible session
- **AND** the original session SHALL remain hidden

#### Scenario: Fork active session
- **WHEN** the user clicks "Fork" on an active session
- **THEN** the server SHALL spawn pi with `pi --fork <session-file-path>` in the session's cwd
- **AND** a new independent session SHALL be created without affecting the original

### Requirement: Resume/fork protocol messages
The browser SHALL send a `resume_session` message to the server specifying the session ID and mode (`"continue"` or `"fork"`). The server SHALL look up the session file and spawn pi accordingly.

#### Scenario: Continue mode
- **WHEN** the browser sends `resume_session` with `mode: "continue"` and `sessionId`
- **THEN** the server SHALL look up the `session_file` for that session and spawn `pi --session <path>`

#### Scenario: Fork mode
- **WHEN** the browser sends `resume_session` with `mode: "fork"` and `sessionId`
- **THEN** the server SHALL look up the `session_file` for that session and spawn `pi --fork <path>`

#### Scenario: Spawn result reported to browser
- **WHEN** the server spawns pi for resume/fork
- **THEN** it SHALL send a response message back to the requesting browser with `success: boolean` and `message: string`
