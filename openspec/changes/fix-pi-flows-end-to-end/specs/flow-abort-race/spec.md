## ADDED Requirements

### Requirement: Parallel agent batch races AbortSignal

`pi-flows`'s `flow-execution.ts` SHALL wrap every parallel agent batch in a `Promise.race` against an abort-signal-derived rejecting promise. When the AbortSignal fires:

- The race SHALL settle within one event-loop tick (≤ 10 ms wall-time under no load).
- The parent loop SHALL throw `FlowCancelledError` and unwind without waiting on still-running child promises.
- Any child agent still in flight SHALL continue to observe its own `session.abort()` listener (existing behavior) and cancel its provider stream call via the SDK's AbortSignal-aware streamer; results from those late-completing children SHALL be discarded by the parent.

The wrapper SHALL not destroy or detach the underlying `Promise.all` — that promise continues so child cleanup runs to completion in the background, but the parent flow no longer awaits it.

#### Scenario: Abort during parallel batch unblocks parent within 100ms

- **WHEN** a flow runs 3 agents in parallel and the AbortSignal fires mid-batch
- **THEN** the parent flow's promise SHALL reject with `FlowCancelledError` within 100 ms of the signal firing
- **AND** any host observing the flow (TUI or otherwise) SHALL receive the cancellation through the existing observer interface within that window

#### Scenario: Aborted child stream cancels at provider HTTP layer

- **WHEN** a child agent's provider stream is in flight at abort time
- **THEN** the underlying HTTP request to the provider SHALL be cancelled via the SDK's AbortSignal-aware streamer (existing SDK behavior, verified by `streamSimple` accepting `options.signal`)

#### Scenario: Synthetic cancelled result emitted per pending child

- **WHEN** the parent unwinds due to abort and N children were still in flight
- **THEN** the flow result SHALL include N entries with `cancelled: true` so observers (TUI + dashboard) render accurate per-agent state

### Requirement: AbortSignal is threaded into every agent spawn path

Every call site that spawns an agent (forks, decisions, loops, parallel batches) SHALL pass `options.signal` into `spawnAgent`. The existing thread (already verified for fork-decision, loop-decision, parallel) SHALL not regress.

A repo-lint test SHALL forbid any new `spawnAgent` call without an explicit `signal:` field.

#### Scenario: Repo lint catches missing signal field

- **WHEN** a new `spawnAgent({...})` call is added without `signal:`
- **THEN** the repo-lint test SHALL fail with a message naming the offending file:line
