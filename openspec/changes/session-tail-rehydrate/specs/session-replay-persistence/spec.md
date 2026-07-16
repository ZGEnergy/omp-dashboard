## MODIFIED Requirements

### Requirement: Durable replay cache is an optimization only

The client SHALL persist a per-session raw event payload + cursor in IndexedDB so
a reload can delta-subscribe. The cache remains an optimization: miss, schema
mismatch, or `session_state_reset` SHALL fall back to a safe network path
without rendering stale history as authoritative.

#### Scenario: Reload with cache hit

- **WHEN** the user reloads and a valid cache entry exists for the session
- **THEN** the client SHALL pre-seed reduced state from the cached payload
- **AND** SHALL subscribe with `lastSeq = persisted maxSeq` (and MAY set
  `mode: "tail"`)
- **AND** the server SHALL delta-replay only events after that cursor when present

#### Scenario: Cache miss

- **WHEN** no entry exists, schema mismatches, or IndexedDB errors
- **THEN** the client SHALL subscribe without relying on cached state
- **AND** for cold open SHALL use `mode: "tail"` so the server does not force a
  full multi-megabyte replay when history is large

### Requirement: Over-budget sessions remain cacheable

When the live raw-event buffer exceeds the per-session byte budget, the client
SHALL persist a **newest-first tail** that fits the budget rather than skipping
persist or deleting the entry solely due to size.

#### Scenario: Large session put trims to tail

- **WHEN** the debounced persister flushes a buffer whose serialized size exceeds
  the budget
- **THEN** the cache SHALL store the newest events under the budget
- **AND** SHALL record `maxSeq` as the highest seq in that tail
- **AND** a subsequent reload SHALL be able to cache-hit that tail

#### Scenario: Schema version bump invalidates old shape

- **WHEN** `schemaVersion` on disk does not match the running client
- **THEN** the get path SHALL treat the entry as a miss (full/tail network path)

### Requirement: Reset purges cache

#### Scenario: session_state_reset drops entry

- **WHEN** the client receives `session_state_reset` for a session
- **THEN** it SHALL delete that session's cache entry and in-memory persist buffer
- **AND** subsequent subscribe SHALL not use the purged maxSeq
