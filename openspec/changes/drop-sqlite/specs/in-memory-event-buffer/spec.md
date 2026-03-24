## ADDED Requirements

### Requirement: In-memory event storage
The dashboard server SHALL store events in an in-memory `Map<sessionId, { events: StoredEvent[], lastAccess: number }>` instead of SQLite. The EventStore interface (`insertEvent`, `getEvents`, `getEvent`, `deleteEventsForSession`) SHALL be preserved so consumers (browser-gateway, server) remain unchanged.

#### Scenario: Event insertion
- **WHEN** an event arrives from a bridge extension for session "abc"
- **THEN** the server SHALL assign the next sequence number, store the event in the in-memory buffer for that session, and update `lastAccess` to the current timestamp

#### Scenario: Event retrieval for replay
- **WHEN** a browser subscribes with `lastSeq: 50` for session "abc"
- **THEN** the server SHALL return all events with seq > 50 from the in-memory buffer

#### Scenario: Full replay
- **WHEN** a browser subscribes with no `lastSeq` for session "abc"
- **THEN** the server SHALL return all events from the in-memory buffer for that session

#### Scenario: Delete events for session
- **WHEN** a bridge reconnects and sends `session_register`
- **THEN** the server SHALL clear the in-memory buffer for that session (existing behavior preserved)

#### Scenario: Fetch single event
- **WHEN** a browser requests a specific event by sessionId and seq
- **THEN** the server SHALL return the event from the in-memory buffer, or undefined if not found

### Requirement: LRU eviction policy
The in-memory event buffer SHALL enforce a maximum number of cached sessions (default 100, configurable). When the limit is exceeded, the least-recently-accessed ended sessions with zero browser subscribers SHALL be evicted.

#### Scenario: Eviction triggers on insert
- **WHEN** an event is inserted and the total cached session count exceeds `MAX_CACHED_SESSIONS`
- **THEN** the server SHALL evict the least-recently-accessed session that is ended and has zero browser subscribers

#### Scenario: Active sessions are never evicted
- **WHEN** eviction runs and a session has an active bridge connection
- **THEN** that session SHALL NOT be evicted regardless of `lastAccess`

#### Scenario: Subscribed sessions are never evicted
- **WHEN** eviction runs and a session has browser subscribers
- **THEN** that session SHALL NOT be evicted regardless of `lastAccess`

#### Scenario: Evicted session re-requested
- **WHEN** a browser subscribes to a session whose events were evicted
- **THEN** the server SHALL trigger on-demand loading via bridge (see on-demand-session-replay spec)

#### Scenario: lastAccess updated on read
- **WHEN** events are read for a session (getEvents or getEvent)
- **THEN** the `lastAccess` timestamp SHALL be updated to prevent premature eviction

### Requirement: Subscriber-count awareness for pinning
The in-memory event store SHALL receive an `isSessionPinned(sessionId): boolean` callback at creation time. The callback SHALL return true when a session has an active bridge connection OR has browser subscribers > 0. Pinned sessions SHALL never be evicted.

#### Scenario: Pinning callback injected at creation
- **WHEN** the memory event store is created
- **THEN** it SHALL accept an `isSessionPinned` callback parameter

#### Scenario: Pinned session skipped during eviction
- **WHEN** eviction runs and `isSessionPinned("abc")` returns true
- **THEN** session "abc" SHALL be skipped and the next evictable session considered
