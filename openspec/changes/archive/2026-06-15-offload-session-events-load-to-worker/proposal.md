## Why

Session-event hydration runs CPU-bound and synchronous-fs work on the main event loop. `subscription-handler.ts:239` awaits `DirectoryService.loadSessionEvents()` inside the WebSocket message handler; that call does `readFileSync` of the entire session JSONL (up to 52 MB measured on the affected machine), `JSON.parse` per line, a tree-walk to find the leaf branch (`loadSessionEntries`), then `replayEntriesAsEvents` to materialize the event array. While this runs, every other session's WebSocket frames — including streamed LLM tokens — queue behind it on the same loop. The user-visible symptom: clicking an older session stutters streaming in the tab you were watching.

This is the same class of fix as the just-shipped `offload-openspec-poll-to-worker`: move the parse + replay off the main loop into a `worker_threads` worker, keeping cache/dedup/broadcast ownership on the main thread. Two differences from the openspec-poll case drive the design:

1. **Output volume is large.** A 52 MB JSONL can materialize multiple MB of events. Structured-clone across the worker boundary on every hydration is non-trivial — but still cheaper than blocking the loop for the whole parse. We accept the clone cost initially; `transferList` is a later optimization only if metrics justify it.
2. **Jobs are cancellable.** A user who clicks session A then immediately session B makes A's hydration wasted work. The pool MUST support `cancel(jobId)` so the subscription handler can drop in-flight loads on unsubscribe — a capability the openspec-poll pool does not have.

This change deliberately **copies** the openspec-poll worker-pool scaffold rather than extracting a shared generic pool. Per the rule of three, the generic extraction happens at the third consumer (`offload-session-scan-to-worker`), once cancellation and side-effecting-write requirements have both been seen. See `docs/architecture-notes/worker-offload-roadmap.md` if present.

## What Changes

- **NEW** `packages/server/src/session-load-worker.ts` — a `worker_threads` worker. Input `{ jobId, sessionId, sessionFile, knownContextWindow }`. Output `{ jobId, success, events, error }`. Imports the existing pure helpers (`loadSessionEntries` from `session-file-reader.ts`, `replayEntriesAsEvents` from `@blackbelt-technology/pi-dashboard-shared/state-replay.js`) — no logic duplicated, only relocated. The `.map((m) => m.event)` projection runs in-worker so only the final `events` array crosses the boundary.
- **NEW** `packages/server/src/session-load-worker-pool.ts` — fixed-size pool modeled on `openspec-poll-worker-pool.ts` (size `min(maxConcurrentSpawns, cpus)`, ≥1), request queue, per-request timeout (default from observed p99 hydration `wallMs` × safety factor), in-process fallback on spawn/crash/timeout, lifecycle tied to `DirectoryService` start/stop. **Adds `cancel(jobId)`**: a queued job is dropped from the queue; an in-flight job is abandoned (result discarded on arrival) — the worker is not killed for a cancel (kill only on timeout/crash).
- **MODIFY** `packages/server/src/directory-service.ts::loadSessionEvents()` — dispatch the parse + replay to the pool instead of running inline. Keep the `loadingSet` dedup on the main thread (it guards re-entry per sessionId, orthogonal to where work runs). Return a `{ result, jobId, cancel }` handle (or expose `cancelLoad(sessionId)`) so callers can cancel. The in-process fallback path is retained permanently for environments where `worker_threads` is unavailable.
- **MODIFY** `packages/server/src/browser-handlers/subscription-handler.ts` — on unsubscribe (or re-subscribe to a different session) before a hydration resolves, call the cancel hook so the worker job is dropped. Preserve all existing post-load behavior (`eventStore.insertEvent`, `session_updated` broadcast, asset/ui replay).
- **NEW** `DashboardConfig` flag (reuse `openspec.useWorker` is wrong-scoped) — add `sessions.useLoadWorker` (default `true`) with validator + clamp in `packages/shared/src/config.ts`. `false` → permanent in-process path.
- **NEW** `packages/server/src/__tests__/session-load-worker.test.ts` — parity: worker `events` equal the in-process `loadSessionEntries` + `replayEntriesAsEvents` projection for a fixture JSONL (including tree-branch and linear-fallback fixtures). Fallback test: worker unavailable → correct events in-process. Cancellation test: a cancelled in-flight job's result is discarded and never reaches `eventStore`.
- **DOCUMENTATION** — `docs/architecture.md`: hydration worker subsection (main-thread vs worker split, cancellation semantics, fallback). File-index rows for the two new files.

## Non-Goals

- Not optimizing the boundary copy with `transferList`/`SharedArrayBuffer` — accept structured clone first; revisit only if `eventLoopDelay`/hydration metrics still show pressure.
- Not offloading `scanAllSessions` boot scan — that is `offload-session-scan-to-worker`.
- Not extracting a generic worker pool — deferred to the third consumer per rule-of-three.
- Not changing `MAX_REPLAY_EVENTS`, replay correctness, or the event-store insert path.

## Dependencies / Sequencing

- **Depends on** `instrument-session-hydration-timing` (merged): its `eventLoopDelay` + `hydration` `wallMs` samples set this change's worker timeout and justify the offload. If post-instrumentation data shows hydration never stalls the loop meaningfully, **defer this change**.
- **Independent of** the openspec-poll worker (different subsystem, copied scaffold).

## Migration / Compatibility / Rollback

- **Migration**: none. No persisted state, schema, or protocol change. The worker is an internal `DirectoryService` detail.
- **Compatibility**: hydration produces byte-identical `events` (parity test enforces equality with in-process projection). Clients see no protocol difference; `event_replay` frames are unchanged.
- **Rollback**: flip `sessions.useLoadWorker` to `false` (config, not redeploy) → reverts to in-process. The in-process fallback path is retained permanently.
- **Risk**: (1) boundary clone of multi-MB event arrays — bounded by the timeout + fallback, measured cheaper than the loop stall it removes. (2) Cancellation race — a job resolving the same tick it is cancelled must discard its result idempotently; the cancellation test pins this. (3) Worker crash mid-load → pool respawns, that hydration falls back in-process, no dropped/corrupt `event_replay`.
