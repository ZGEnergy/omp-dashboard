## ADDED Requirements

### Requirement: Session-event hydration runs off the main event loop

The server SHALL perform session-event hydration parsing and replay (`loadSessionEntries` JSONL parse + tree-walk, and `replayEntriesAsEvents` materialization) in a `worker_threads` worker, so this CPU-bound and synchronous-fs work does not block the main event loop that serves HTTP requests and WebSocket frames. The main thread SHALL retain ownership of the per-session `loadingSet` dedup, the `eventStore` inserts, and the `event_replay` / `session_updated` broadcasts.

The behavior SHALL be governed by `DashboardConfig.sessions.useLoadWorker` (default `true`). When `false`, hydration SHALL run in-process exactly as on the pre-worker path.

#### Scenario: Hydrated events are identical to in-process replay
- **WHEN** the worker hydrates a session
- **THEN** the resulting `events` array SHALL equal the in-process `loadSessionEntries` + `replayEntriesAsEvents` projection for the same session file and known context window
- **AND** this SHALL hold for both tree-branch and linear-fallback session files

#### Scenario: Worker unavailable falls back in-process
- **WHEN** the worker cannot be spawned, times out, or crashes during a hydration
- **THEN** the server SHALL hydrate that session in-process for that request
- **AND** the `event_replay` SHALL still be emitted with correct, uncorrupted events

#### Scenario: In-flight hydration is cancellable
- **WHEN** a client unsubscribes from a session, or subscribes to a different session, before its hydration resolves
- **THEN** the server SHALL cancel the in-flight hydration job
- **AND** the cancelled job's result SHALL NOT be inserted into the event store nor broadcast
- **AND** a plain cancel SHALL NOT terminate the worker (only timeout/crash terminates it)

#### Scenario: useLoadWorker disabled
- **WHEN** `DashboardConfig.sessions.useLoadWorker` is `false`
- **THEN** the server SHALL run all hydration in-process and SHALL NOT spawn the session-load worker

#### Scenario: Dedup unaffected by offload
- **WHEN** two concurrent requests hydrate the same session id
- **THEN** the existing `loadingSet` dedup SHALL still prevent re-entrant loads on the main thread regardless of where parsing runs
