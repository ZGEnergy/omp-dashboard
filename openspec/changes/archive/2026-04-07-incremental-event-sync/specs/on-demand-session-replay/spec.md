## MODIFIED Requirements

### Requirement: On-demand session loading via server
When a browser subscribes to a session whose events are not in memory, the server SHALL load the session directly from pi's session file on disk using `SessionManager.open(sessionFile).getBranch()`, without routing through a bridge.

#### Scenario: Browser subscribes to evicted session
- **WHEN** a browser subscribes to session "abc" whose events are not in memory, and the session has a `sessionFile` path
- **THEN** the server SHALL send an immediate `event_replay { events: [], isLast: false }` to the browser, load the session file directly via `SessionManager.open(sessionFile).getBranch()`, convert entries via `replayEntriesAsEvents()`, store in the event buffer, and send `event_replay { events, isLast: true }` to the browser

#### Scenario: Session file unavailable
- **WHEN** a browser subscribes to a session whose `sessionFile` does not exist, is corrupted, or is not set
- **THEN** the server SHALL send `event_replay { events: [], isLast: true }` and `session_updated { dataUnavailable: true }`

#### Scenario: Multiple browsers subscribe to same evicted session
- **WHEN** two browsers subscribe to the same evicted session before the load completes
- **THEN** the server SHALL deduplicate the load and deliver loaded events to both browsers

#### Scenario: Loaded events are buffered for future requests
- **WHEN** events are loaded on demand from disk
- **THEN** the server SHALL store them in the in-memory event buffer so subsequent browser subscribes do not trigger another load

### Requirement: Stale lastSeq detection on subscribe
The subscription handler SHALL detect when a browser's `lastSeq` exceeds the server's max stored seq, and trigger a full reset-and-replay.

#### Scenario: Stale lastSeq triggers reset
- **WHEN** a browser subscribes with `lastSeq: 500` and the server has events up to seq `10` for that session
- **THEN** the server SHALL send `session_state_reset` to that browser WebSocket
- **AND** replay all events from seq 1

#### Scenario: Valid lastSeq returns delta
- **WHEN** a browser subscribes with `lastSeq: 50` and the server has events up to seq `100`
- **THEN** the server SHALL replay events with seq 51–100 without sending `session_state_reset`
