## ADDED Requirements

### Requirement: Auto-resume on prompt to ended session
When the server receives a `send_prompt` message for a session with status `"ended"`, it SHALL automatically initiate a resume (continue mode) instead of silently dropping the prompt.

#### Scenario: Prompt sent to ended session with session file
- **WHEN** the server receives `send_prompt` for a session with `status === "ended"` and a valid `sessionFile`
- **THEN** the server SHALL store the prompt in the `PendingResumeRegistry` keyed by the session's `cwd`
- **AND** set `resuming: true` on the old session and broadcast `session_updated`
- **AND** spawn a new pi process with `pi --session <sessionFile>` in continue mode

#### Scenario: Prompt sent to ended session without session file
- **WHEN** the server receives `send_prompt` for a session with `status === "ended"` and no `sessionFile`
- **THEN** the server SHALL log an error and NOT attempt to resume
- **AND** the prompt SHALL be dropped (same as current behavior)

#### Scenario: Prompt sent to active session
- **WHEN** the server receives `send_prompt` for a session with `status !== "ended"`
- **THEN** the server SHALL forward the prompt to the bridge as normal (no auto-resume logic)

### Requirement: Pending resume registry
The server SHALL maintain a `PendingResumeRegistry` that queues prompts for ended sessions being resumed.

#### Scenario: Registry entry structure
- **WHEN** a pending resume is recorded
- **THEN** the entry SHALL contain the prompt `text`, optional `images`, the `oldSessionId`, the `sessionFile`, and a 30-second expiry timer

#### Scenario: Registry keyed by cwd
- **WHEN** a pending resume is recorded for a session with a given `cwd`
- **THEN** the entry SHALL be stored with the `cwd` as the key
- **AND** any previous entry for the same `cwd` SHALL be overwritten (its timer cleared)

#### Scenario: Expiry timeout
- **WHEN** 30 seconds pass without the pending resume being consumed
- **THEN** the entry SHALL be deleted
- **AND** the `resuming` flag on the old session SHALL be cleared to `false`
- **AND** `session_updated` SHALL be broadcast to restore the card to normal ended state

### Requirement: Prompt flush on bridge reconnection
When a new session registers via `session_register`, the server SHALL check the `PendingResumeRegistry` for a matching entry and forward the queued prompt.

#### Scenario: New session registers with matching cwd
- **WHEN** a new session sends `session_register` with a `cwd` that has a pending resume entry
- **THEN** the server SHALL consume the entry and send the queued prompt (text + images) to the new session via `piGateway.sendToSession()`

#### Scenario: No matching pending resume
- **WHEN** a new session sends `session_register` with a `cwd` that has no pending resume entry
- **THEN** the server SHALL proceed normally without any prompt forwarding

### Requirement: Auto-hide old session on successful resume
When a pending resume is successfully flushed, the server SHALL hide the old ended session.

#### Scenario: Old session hidden after flush
- **WHEN** the pending resume prompt is successfully forwarded to the new session
- **THEN** the server SHALL set `hidden: true` and `resuming: false` on the old session
- **AND** broadcast `session_updated` with those changes

### Requirement: Auto-navigate browser to new session
When a pending resume is successfully flushed, the server SHALL notify the browser to navigate to the new session.

#### Scenario: Navigation message sent
- **WHEN** the pending resume prompt is successfully forwarded to the new session
- **THEN** the server SHALL broadcast an `auto_resume_navigate` message with `oldSessionId` and `newSessionId`

#### Scenario: Client handles navigation
- **WHEN** the client receives `auto_resume_navigate`
- **THEN** the client SHALL navigate to `/session/<newSessionId>`

### Requirement: Spawn failure handling
When the resume spawn fails, the server SHALL clean up the pending state.

#### Scenario: Spawn returns failure
- **WHEN** `spawnPiSession` returns `success: false` for an auto-resume attempt
- **THEN** the server SHALL remove the entry from the `PendingResumeRegistry`
- **AND** clear the `resuming` flag on the old session
- **AND** broadcast `session_updated` to restore the card to normal ended state
