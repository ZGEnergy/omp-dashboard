## ADDED Requirements

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
