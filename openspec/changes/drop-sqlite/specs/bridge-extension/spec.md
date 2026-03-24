## ADDED Requirements

### Requirement: On-demand session file loading
The bridge extension SHALL handle `load_session_events` messages from the server. Upon receiving such a message, it SHALL load the specified session file using pi's `SessionManager.open()`, extract entries via `getBranch()`, convert them to dashboard events via `replayEntriesAsEvents()`, and send the result back as a single `load_session_events_result` message.

#### Scenario: Load session file successfully
- **WHEN** the bridge receives `load_session_events` with `sessionId` and `sessionFile` path
- **THEN** it SHALL call `SessionManager.open(sessionFile).getBranch()`, convert entries via `replayEntriesAsEvents(sessionId, entries)`, and send a `load_session_events_result` message containing all events

#### Scenario: Session file does not exist
- **WHEN** the bridge receives `load_session_events` but the file path does not exist
- **THEN** it SHALL send a `load_session_events_error` message with `sessionId` and `error: "file_not_found"`

#### Scenario: Session file is corrupted
- **WHEN** the bridge receives `load_session_events` but the file cannot be parsed
- **THEN** it SHALL send a `load_session_events_error` message with `sessionId` and `error: "parse_error"`

#### Scenario: Loading does not affect current session
- **WHEN** the bridge loads an old session file for replay
- **THEN** the current pi session SHALL NOT be affected — the load uses a separate `SessionManager` instance

#### Scenario: Loading during active streaming
- **WHEN** the bridge receives `load_session_events` while the current session is actively streaming
- **THEN** the load SHALL proceed independently using a separate `SessionManager.open()` call, and live event forwarding SHALL continue uninterrupted
