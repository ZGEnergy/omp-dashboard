## ADDED Requirements

### Requirement: On-demand session loading via bridge
When a browser subscribes to a session whose events are not in memory, the server SHALL request a connected bridge to load the session from pi's session file on disk.

#### Scenario: Browser subscribes to evicted session with available bridge
- **WHEN** a browser subscribes to session "abc" whose events are not in memory, and a bridge is connected whose `cwd` overlaps the session's `cwd`
- **THEN** the server SHALL send an immediate `event_replay { events: [], isLast: false }` to the browser, then send a `load_session_events` message to the bridge with the session's `sessionFile` path

#### Scenario: Browser subscribes to evicted session with no available bridge
- **WHEN** a browser subscribes to session "abc" whose events are not in memory, and no bridge is connected for that workspace
- **THEN** the server SHALL send `event_replay { events: [], isLast: true }` and `session_updated { dataUnavailable: true }` so the browser can show an appropriate message

#### Scenario: Multiple browsers subscribe to same evicted session
- **WHEN** two browsers subscribe to the same evicted session before the bridge responds
- **THEN** the server SHALL send only one `load_session_events` to the bridge, add both browsers to the pending load's waiting set, and replay the loaded events to both browsers once received

#### Scenario: Bridge loads session file successfully
- **WHEN** the bridge receives `load_session_events` with a valid session file path
- **THEN** the bridge SHALL call `SessionManager.open(sessionFile).getBranch()`, convert entries via `replayEntriesAsEvents(sessionId, entries)`, and send them back as a single `load_session_events_result` message containing all events

#### Scenario: Bridge cannot load session file
- **WHEN** the bridge receives `load_session_events` but the file does not exist or is corrupted
- **THEN** the bridge SHALL send a `load_session_events_error` message with `sessionId` and `error` reason

#### Scenario: Loaded events are buffered for future requests
- **WHEN** events are loaded on demand from a bridge
- **THEN** the server SHALL store them in the in-memory event buffer so subsequent browser subscribes do not trigger another bridge load

### Requirement: Pending load tracking
The server SHALL maintain a `pendingLoads: Map<sessionId, { requestedAt, browsers, bridgeSessionId }>` to track in-flight on-demand load requests.

#### Scenario: Deduplication of concurrent requests
- **WHEN** a browser subscribes to session "abc" that already has a pending load
- **THEN** the browser SHALL be added to the pending load's browser set and receive `event_replay { events: [], isLast: false }` immediately, without sending a second `load_session_events` to the bridge

#### Scenario: Load timeout
- **WHEN** a pending load has been in-flight for more than 10 seconds without receiving `load_session_events_result` or `load_session_events_error`
- **THEN** the server SHALL treat it as a failure, send `session_updated { dataUnavailable: true }` to all waiting browsers, and clean up the pending entry

#### Scenario: Bridge disconnects during pending load
- **WHEN** a bridge WebSocket closes and it has associated pending loads
- **THEN** the server SHALL cancel those pending loads, attempt to find another bridge for the same workspace, and if none available send `session_updated { dataUnavailable: true }` to waiting browsers

### Requirement: Batch replay for on-demand loaded events
On-demand loaded events SHALL be delivered as batch `event_replay` messages, not as individual live `event` broadcasts. This prevents confusion between live streaming events and historical replay.

#### Scenario: Server receives load result
- **WHEN** the server receives `load_session_events_result` with events for session "abc"
- **THEN** it SHALL insert all events into the in-memory buffer, then send `event_replay { events, isLast: true }` to all waiting browsers in the pending load set

#### Scenario: Live events not affected by pending loads
- **WHEN** live `event_forward` messages arrive for an active session while a different session has a pending load
- **THEN** the live events SHALL be broadcast normally to subscribers — pending load tracking only applies to the specific session being loaded
