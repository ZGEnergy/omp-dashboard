## ADDED Requirements

### Requirement: Tail-mode subscribe

The browser MAY send `subscribe` with `mode: "tail"` and optional `windowBytes`.
When `mode` is absent or `"full"`, the server SHALL retain existing full/delta
replay behavior. When `mode` is `"tail"` and `lastSeq` is absent or `0`, the
server SHALL deliver only the newest events that fit the effective byte budget
(default 4 MiB, clamped), not the entire session buffer.

#### Scenario: Cold tail open under budget

- **WHEN** a browser subscribes with `mode: "tail"` and `lastSeq` 0 to a session
  whose full event buffer serializes under the budget
- **THEN** the server SHALL deliver all events in ascending seq order
- **AND** `hasMoreOlder` SHALL be false

#### Scenario: Cold tail open over budget

- **WHEN** a browser subscribes with `mode: "tail"` and `lastSeq` 0 to a session
  whose full event buffer serializes over the budget
- **THEN** the server SHALL deliver a newest-first subset under the budget
- **AND** `hasMoreOlder` SHALL be true
- **AND** `windowMinSeq` SHALL equal the lowest delivered seq
- **AND** `windowMaxSeq` SHALL equal the highest delivered seq

#### Scenario: Legacy client full replay

- **WHEN** a browser subscribes without `mode` and `lastSeq` 0
- **THEN** the server SHALL deliver the full available event buffer as today

#### Scenario: Delta ignores tail mode

- **WHEN** a browser subscribes with `mode: "tail"` and `lastSeq > 0` and the
  server has events with `seq > lastSeq`
- **THEN** the server SHALL delta-replay only those events (existing path)

### Requirement: Load-older page

The browser MAY send `subscribe` (or an equivalent same-session request) with
`fromSeq: N` to request older history. The server SHALL return the newest events
with `seq < N` that fit the budget, with updated `hasMoreOlder` / window fields.
The client SHALL merge them without wiping already-reduced state.

#### Scenario: Older page under budget

- **WHEN** the client requests older history with `fromSeq` equal to the current
  `windowMinSeq` and older events exist
- **THEN** the server SHALL deliver events strictly older than `fromSeq`
- **AND** the client SHALL prepend them into the session transcript
- **AND** the visible scroll anchor SHALL remain stable

#### Scenario: No older history

- **WHEN** `fromSeq` is less than or equal to the oldest available seq
- **THEN** the server SHALL deliver an empty (or terminal) page with
  `hasMoreOlder: false`

### Requirement: Byte-budget selection

Event window selection SHALL walk newest→oldest, include whole events only, and
always include at least the newest event when the buffer is non-empty. Client
IDB tail trim and server wire selection SHALL use the same algorithm.

#### Scenario: Deterministic trim

- **WHEN** the same ordered event list and budget are passed to the shared helper
- **THEN** client and server SHALL produce identical seq sets
