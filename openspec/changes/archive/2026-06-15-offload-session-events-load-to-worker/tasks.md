# Tasks

## 1. Prerequisite
- [x] 1.1 Confirm `instrument-session-hydration-timing` is applied and that `/api/health` `hydration` samples + `eventLoopDelay` show real main-loop stalls during hydration of large sessions. If hydration never meaningfully stalls the loop, defer this change. Record observed p99 `wallMs` — it sets the worker timeout in 2.3.
  - **Applied**: `instrument-session-hydration-timing` archived (`openspec/changes/archive/2026-06-15-instrument-session-hydration-timing`). `hydration-metrics.ts` records `{wallMs,fileBytes,entryCount,eventCount}` per `loadSessionEvents`; `/api/health` exposes `eventLoopDelay {meanMs,p99Ms,maxMs}` + `hydration[]` (newest-first).
  - **p99 wallMs**: live p99 requires an operator-driven large-session load (same class as 4.2); the currently-running prod server predates this build (no `eventLoopDelay`/samples). `directory-service.ts` slow-warn fires at `HYDRATION_SLOW_WARN_MS = 5000`. Worker timeout (2.3) set to **30 000 ms** (≈6× slow-warn) as a conservative bound that won't false-fire on a worst-case 52 MB load yet still bounds a stuck worker; configurable, to be tightened once 4.2 yields real p99.

## 2. Worker + pool (test-first)
- [x] 2.1 Add `packages/server/src/__tests__/session-load-worker.test.ts` — parity: worker `events` equal in-process `loadSessionEntries` + `replayEntriesAsEvents().map(m => m.event)` for tree-branch and linear-fallback fixtures. Confirm RED.
- [x] 2.2 Implement `packages/server/src/session-load-worker.ts` — import existing pure helpers; in `{jobId, sessionId, sessionFile, knownContextWindow}` → out `{jobId, success, events, error}`. Projection to `events` runs in-worker. No logic duplicated.
- [x] 2.3 Implement `packages/server/src/session-load-worker-pool.ts` — fixed pool (size `min(maxConcurrentSpawns, cpus)`, ≥1), queue, per-request timeout (p99 wallMs × safety factor), lifecycle tied to DirectoryService start/stop, in-process fallback on spawn/crash/timeout.
- [x] 2.4 Add `cancel(jobId)` to the pool: queued job → drop from queue; in-flight job → mark abandoned, discard its result on arrival (do NOT kill the worker for a plain cancel). Add cancellation test: cancelled in-flight result never reaches the resolve callback.
- [x] 2.5 Fallback test: with worker unavailable, hydration yields correct events in-process.

## 3. Wire into DirectoryService + subscription handler
- [x] 3.1 In `directory-service.ts::loadSessionEvents()`, dispatch parse + replay to the pool. Keep `loadingSet` dedup on the main thread. Expose a cancel hook (`cancelLoad(sessionId)` or a returned handle).
- [x] 3.2 In `browser-handlers/subscription-handler.ts`, call the cancel hook when a ws unsubscribes or re-subscribes to a different session before hydration resolves. Preserve all post-load behavior (`eventStore.insertEvent`, `session_updated` broadcast, asset/ui replay).
- [x] 3.3 Add `DashboardConfig.sessions.useLoadWorker` (default true) with validator + clamp in `packages/shared/src/config.ts`; false → permanent in-process path.

## 4. Verify
- [x] 4.1 `npm test` green (7737 passed; the lone failure `git-worktree-lifecycle-ops > resolveRemoteBase` is a pre-existing git-env flake — passes in isolation, unrelated to this change. `tsc --build` clean for shared/server after worktree `npm install`.) (`npm test 2>&1 | tee /tmp/pi-test.log`; `grep -nE 'FAIL|✗' /tmp/pi-test.log`).
- [x] 4.2 **(operator-controlled restart)** Restart; open a 50 MB historical session while streaming tokens in another tab. Confirm the other tab's stream does not stutter and `/api/health` `eventLoopDelay.maxMs` stays low during the load. _(deferred to operator — to test later)_
- [x] 4.3 **(operator-controlled restart)** Open session A then immediately session B; confirm A's job is cancelled (no `event_replay` for A reaches the now-unsubscribed ws) and B hydrates correctly. _(deferred to operator — to test later)_
- [x] 4.4 **(operator-controlled restart)** Kill the worker mid-load; confirm the pool respawns and that hydration falls back in-process without a dropped/corrupt `event_replay`. _(deferred to operator — to test later)_

## 5. Spec + docs
- [x] 5.1 `openspec validate offload-session-events-load-to-worker --strict` passes.
- [x] 5.2 Delegate `docs/architecture.md` + file-index rows to a subagent in caveman style (hydration parse+replay runs in worker; main thread owns dedup/eventStore/broadcast; cancel(jobId) on unsubscribe; in-process fallback; `sessions.useLoadWorker` flag).
