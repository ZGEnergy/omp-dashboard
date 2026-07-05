## Purpose

In-memory per-session event buffer for the dashboard server: stores forwarded
`DashboardEvent`s, serves them for replay, bounds memory via a per-session event
cap and LRU session eviction.
## Requirements
### Requirement: In-memory event storage
The dashboard server SHALL store events in an in-memory `Map<sessionId, { events: StoredEvent[], lastAccess: number }>` instead of SQLite. The EventStore interface (`insertEvent`, `getEvents`, `getEvent`, `deleteEventsForSession`, `hasEvents`, `sessionCount`) SHALL be preserved so consumers (browser-gateway, server) remain unchanged. The EventStore SHALL additionally expose `getMaxSeq(sessionId): number` to return the highest stored sequence number for a session.

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
- **WHEN** a bridge reconnects and the server determines a full wipe is needed (eventCount mismatch or no eventCount provided)
- **THEN** the server SHALL clear the in-memory buffer for that session

#### Scenario: Skip delete when eventCount matches
- **WHEN** a bridge reconnects with matching `eventCount`
- **THEN** the server SHALL NOT clear the in-memory buffer for that session

#### Scenario: Fetch single event
- **WHEN** a browser requests a specific event by sessionId and seq
- **THEN** the server SHALL return the event from the in-memory buffer, or undefined if not found

#### Scenario: Get max sequence number
- **WHEN** the subscription handler needs to detect stale `lastSeq`
- **THEN** `getMaxSeq(sessionId)` SHALL return the highest seq in the buffer, or `0` if no events exist

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

### Requirement: Image data preservation during truncation
The event store string truncation SHALL preserve base64 image data fields. When truncating object fields, if a key is `"data"` and the parent object contains a `"mimeType"` key, the value SHALL NOT be truncated.

#### Scenario: Image base64 data preserved
- **WHEN** a `message_start` event contains a user message with an image content block `{ type: "image", data: "<200KB base64>", mimeType: "image/png" }`
- **THEN** the event store SHALL store the full `data` string without truncation

#### Scenario: Non-image data fields still truncated
- **WHEN** an event contains an object with `{ data: "<large string>" }` but no `mimeType` key
- **THEN** the `data` field SHALL be truncated per the normal max string size limit

#### Scenario: Other string fields still truncated alongside images
- **WHEN** a `message_start` event contains both an image content block and a large `thinking` field
- **THEN** the `data` field in the image block SHALL be preserved AND the `thinking` field SHALL be truncated normally

### Requirement: Subscriber-count awareness for pinning
The in-memory event store SHALL receive an `isSessionPinned(sessionId): boolean` callback at creation time. The callback SHALL return true when a session has an active bridge connection OR has browser subscribers > 0. Pinned sessions SHALL never be evicted.

#### Scenario: Pinning callback injected at creation
- **WHEN** the memory event store is created
- **THEN** it SHALL accept an `isSessionPinned` callback parameter

#### Scenario: Pinned session skipped during eviction
- **WHEN** eviction runs and `isSessionPinned("abc")` returns true
- **THEN** session "abc" SHALL be skipped and the next evictable session considered

### Requirement: Per-session trim preserves the chat transcript head
The in-memory event buffer SHALL bound each session to `maxEventsPerSession`
events (default 20000, `0` = unlimited). When the buffer exceeds the cap, the
store SHALL drop the OLDEST non-essential event first, where essential chat
events are exactly `message_start` and `message_end`. Essential events SHALL be
retained unless the essential events alone exceed the cap, in which case the
OLDEST essential event SHALL be dropped only to hold the memory bound. Trimming
SHALL NOT renumber surviving events; `getEvents` filters by seq and tolerates
seq gaps.

#### Scenario: Chat head survives a subagent flood
- **GIVEN** a session whose first two stored events are `message_start` (seq 1)
  and `message_end` (seq 2)
- **WHEN** a subagent turn forwards thousands of `tool_execution_*` /
  `subagent_*` events that push the buffer past the cap
- **THEN** seq 1 and seq 2 SHALL still be present and the dropped events SHALL be
  the oldest non-essential events

#### Scenario: Non-essential dropped before essential
- **GIVEN** a buffer at the cap containing both `message_start`/`message_end` and
  `tool_execution_start` events
- **WHEN** a new event is inserted over the cap
- **THEN** the oldest `tool_execution_start` SHALL be dropped and no
  `message_start`/`message_end` SHALL be dropped

#### Scenario: Essential-only overflow falls back to oldest essential
- **WHEN** the buffer holds only `message_start`/`message_end` events and their
  count exceeds the cap
- **THEN** the store SHALL drop the oldest essential events until the count
  equals the cap

### Requirement: Trim reclaim is amortized O(1) via hysteresis
The store SHALL NOT run a reclaim pass on every over-cap insert. It SHALL allow
the buffer to overshoot the cap by a `TRIM_SLACK` margin
(`min(256, floor(maxEventsPerSession * 0.05))`) and, only when the length
exceeds `cap + TRIM_SLACK`, reclaim back to the cap in a single O(n) pass. The
buffer length SHALL never exceed `cap + TRIM_SLACK`.

#### Scenario: Buffer stays bounded under a large flood
- **GIVEN** a session with cap 500 (TRIM_SLACK 25)
- **WHEN** 10000 non-essential events are inserted
- **THEN** the buffer length SHALL be ≤ 525 at all observable points and the
  reclaim SHALL run roughly once per `TRIM_SLACK` inserts, not once per insert

#### Scenario: Bulk history load stays linear
- **WHEN** a session is reopened and every replayed event is inserted through
  `insertEvent` in a loop
- **THEN** the total trim work SHALL be O(events) (amortized), NOT O(events × cap)

