## Purpose

Loads session events on demand when a browser subscribes to a session whose events have been evicted from the in-memory buffer. The server reads session files directly from disk without requiring a bridge connection.

## ADDED Requirements

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

### Requirement: Batch replay for on-demand loaded events
On-demand loaded events SHALL be delivered as batch `event_replay` messages, not as individual live `event` broadcasts. This prevents confusion between live streaming events and historical replay.

#### Scenario: Server receives loaded events
- **WHEN** the server loads events from a session file
- **THEN** it SHALL insert all events into the in-memory buffer, then send `event_replay { events, isLast: true }` to all waiting browsers

### Requirement: Client state reset on full replay
When the browser receives a full `event_replay` (first event has `seq === 1`), the client SHALL reset the session's `SessionState` to its initial state before reducing the replayed events. This prevents duplicate messages when switching between session cards or re-subscribing after a WebSocket reconnect. See the `event-reducer` spec for implementation details.

#### Scenario: Switching to a previously-subscribed session
- **WHEN** a user switches to a session card that was already loaded, triggering a new full replay
- **THEN** the client SHALL reset state and reduce from scratch, producing the same result as a fresh page load

#### Scenario: Live events not affected by loading
- **WHEN** live `event_forward` messages arrive for an active session while a different session is being loaded
- **THEN** the live events SHALL be broadcast normally to subscribers — loading only applies to the specific session being loaded

### Requirement: Stale lastSeq detection on subscribe
The subscription handler SHALL detect when a browser's `lastSeq` exceeds the server's max stored seq, and trigger a full reset-and-replay.

#### Scenario: Stale lastSeq triggers reset
- **WHEN** a browser subscribes with `lastSeq: 500` and the server has events up to seq `10` for that session
- **THEN** the server SHALL send `session_state_reset` to that browser WebSocket
- **AND** replay all events from seq 1

#### Scenario: Valid lastSeq returns delta
- **WHEN** a browser subscribes with `lastSeq: 50` and the server has events up to seq `100`
- **THEN** the server SHALL replay events with seq 51–100 without sending `session_state_reset`
