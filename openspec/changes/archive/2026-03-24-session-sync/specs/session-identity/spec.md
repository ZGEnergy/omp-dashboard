## ADDED Requirements

### Requirement: Pi session ID as dashboard session ID
The bridge extension SHALL use `ctx.sessionManager.getSessionId()` as the dashboard session ID instead of generating a random UUID. The session ID SHALL be read during `session_start` and used for all subsequent protocol messages.

#### Scenario: Session registers with pi session ID
- **WHEN** a pi session starts and the bridge connects
- **THEN** the `session_register` message SHALL use the ID from `ctx.sessionManager.getSessionId()` (e.g., `c9e247a0-23c1-46a1-899e-f4170a1e39e0`)

#### Scenario: Continue same session reconnects with same ID
- **WHEN** a user runs `pi --session <path>` to continue a session
- **THEN** the bridge SHALL register with the same pi session ID, and the dashboard SHALL update the existing session record

### Requirement: Session file and directory tracking
The bridge extension SHALL send the session file path and session directory on registration. These SHALL be obtained from `ctx.sessionManager.getSessionFile()` and `ctx.sessionManager.getSessionDir()`.

#### Scenario: Session file sent on register
- **WHEN** the bridge sends `session_register`
- **THEN** it SHALL include `sessionFile` (e.g., `~/.pi/agent/sessions/--cwd--/2026-03-23_c9e247a0.jsonl`) and `sessionDir` (e.g., `~/.pi/agent/sessions/--cwd--/`)

#### Scenario: Session file not yet persisted
- **WHEN** `ctx.sessionManager.getSessionFile()` returns undefined (new ephemeral session)
- **THEN** `sessionFile` SHALL be omitted from the register message

### Requirement: First message extraction
The bridge extension SHALL extract the first user message text from the session entries and send it as `firstMessage` in the `session_register` message. This enables meaningful session display names before the user explicitly names the session.

#### Scenario: First message sent on register
- **WHEN** the bridge sends `session_register` and the session has at least one user message entry
- **THEN** it SHALL include `firstMessage` with the text content of the first user message (plain text, truncated if necessary)

#### Scenario: No user messages yet
- **WHEN** the bridge sends `session_register` for a brand new session with no messages
- **THEN** `firstMessage` SHALL be omitted from the register message

#### Scenario: First message updated after first turn
- **WHEN** the first `turn_end` event fires and `firstMessage` was not previously sent
- **THEN** the bridge SHALL send a session update with the `firstMessage` extracted from the session entries

### Requirement: Session switch and fork handling
The bridge extension SHALL handle pi's `session_switch` and `session_fork` events by unregistering the old session and registering the new one. The session ID variable SHALL be mutable (`let`, not `const`). Both events SHALL use the same shared handler since the behavior is identical: unregister old ID, read new ID from `ctx.sessionManager.getSessionId()`, register with new ID, full state sync.

Pi fires `session_switch` for `/new` (reason: `"new"`) and `/resume` (reason: `"resume"`). Pi fires `session_fork` for `/fork`. All three result in a new session identity within the same pi process and WebSocket connection.

#### Scenario: User switches to a new session
- **WHEN** pi fires `session_switch` with reason `"new"`
- **THEN** the bridge SHALL send `session_unregister` for the old session ID, update its internal session ID from `ctx.sessionManager.getSessionId()`, and send `session_register` with the new ID followed by full state sync

#### Scenario: User resumes a different session
- **WHEN** pi fires `session_switch` with reason `"resume"`
- **THEN** the bridge SHALL unregister the old session and register the new session, same as for a new session switch

#### Scenario: User forks a session
- **WHEN** pi fires `session_fork`
- **THEN** the bridge SHALL unregister the old session and register the new session (new JSONL file, new pi session ID), same behavior as session_switch

#### Scenario: Events after switch or fork use new ID
- **WHEN** pi events fire after a `session_switch` or `session_fork`
- **THEN** all forwarded events SHALL use the updated session ID

### Requirement: Hidden session lifecycle
Sessions SHALL become hidden when they end and visible when they register. The `hidden` field SHALL be a boolean stored in SQLite.

#### Scenario: Session becomes hidden on end
- **WHEN** a session is unregistered (bridge disconnect, heartbeat timeout, or session_switch)
- **THEN** the server SHALL set `hidden = true` on the session record

#### Scenario: Session becomes visible on register
- **WHEN** a session registers (new connection or reconnection)
- **THEN** the server SHALL set `hidden = false` on the session record

#### Scenario: Sessions are never deleted
- **WHEN** a session ends
- **THEN** the session record SHALL remain in SQLite with `status = "ended"` and `hidden = true`; it SHALL NOT be deleted

#### Scenario: Continue same session restores visibility
- **WHEN** a pi instance connects with `pi --session <path>` reusing an existing session ID
- **THEN** the session record SHALL be updated with `status = "active"`, `hidden = false`
