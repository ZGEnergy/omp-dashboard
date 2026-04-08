## MODIFIED Requirements

### Requirement: Subscription handler extraction
browser-gateway.ts SHALL delegate `subscribe` and `unsubscribe` message handling (including event replay and lazy session loading) to a subscription handler module.

#### Scenario: Subscribe replays events from memory
- **WHEN** a browser subscribes to a session with events in memory
- **THEN** the subscription handler replays events in batches and sends pending UI requests

#### Scenario: Subscribe lazy-loads ended sessions
- **WHEN** a browser subscribes to an ended session not in memory
- **THEN** the subscription handler loads events from disk via DirectoryService and broadcasts them

#### Scenario: Subscribe with lastSeq returns delta
- **WHEN** a browser subscribes with `lastSeq: 50` and the server has events up to seq 100
- **THEN** the subscription handler SHALL replay only events with seq 51–100

#### Scenario: Subscribe with stale lastSeq triggers reset
- **WHEN** a browser subscribes with `lastSeq: 500` but server max seq is 10
- **THEN** the subscription handler SHALL send `session_state_reset` to the subscribing WebSocket and replay all events from seq 1

### Requirement: Lazy session subscription
The browser client SHALL NOT auto-subscribe to all active sessions on connect. Instead, it SHALL subscribe only to the currently selected/viewed session. Sidebar session cards SHALL rely on `session_added` and `session_updated` broadcasts for metadata display.

#### Scenario: Browser connects with no session selected
- **WHEN** a browser client connects and no session is selected
- **THEN** the client SHALL NOT send any `subscribe` messages
- **AND** the sidebar SHALL display session cards using metadata from `session_added` messages

#### Scenario: User selects a session
- **WHEN** the user navigates to session "s1"
- **THEN** the client SHALL send `subscribe { sessionId: "s1", lastSeq: <maxSeq or 0> }`

#### Scenario: Browser reconnects with session selected
- **WHEN** the browser WebSocket reconnects and session "s1" was selected
- **THEN** the client SHALL re-subscribe to "s1" with `lastSeq` from its seq tracker
- **AND** the client SHALL NOT subscribe to other active sessions

#### Scenario: session_added for active session does not trigger subscribe
- **WHEN** the browser receives `session_added` for a new active session
- **THEN** the client SHALL NOT auto-subscribe to that session
- **AND** the sidebar card SHALL display using the session metadata from the message
