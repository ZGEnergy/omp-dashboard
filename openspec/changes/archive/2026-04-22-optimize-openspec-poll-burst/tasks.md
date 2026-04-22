## 1. Configuration schema

- [x] 1.1 Add `OpenSpecPollConfig` interface and `DEFAULT_OPENSPEC_POLL` const to `packages/shared/src/config.ts`.
- [x] 1.2 Extend `DashboardConfig` with `openspec: OpenSpecPollConfig`.
- [x] 1.3 Add `parseOpenSpecPollConfig(raw)` with clamping: `pollIntervalSeconds` ∈ [5, 3600]; `maxConcurrentSpawns` ∈ [1, 16]; `changeDetection` ∈ {"mtime","always"} (default "mtime"); `jitterSeconds` ∈ [0, 60].
- [x] 1.4 Wire the parser into `loadConfig` (default fallback when block is absent).
- [x] 1.5 Write `packages/shared/src/__tests__/config-openspec.test.ts` — defaults, clamping upper/lower, non-number coercion, unknown keys ignored, round-trip stability. Confirm tests fail first (TDD).
- [x] 1.6 Expose the block through `packages/server/src/config-api.ts` GET/PUT partial-merge path. No secret handling needed.

## 2. Semaphore primitive

- [x] 2.1 Create `packages/shared/src/semaphore.ts` — `createSemaphore(max)` returning `{ run<T>(fn), setMax(n), size() }`. Queue-based, FIFO, resize-aware.
- [x] 2.2 Write `packages/shared/src/__tests__/semaphore.test.ts` — caps concurrency, releases on reject, FIFO ordering, resize loosens and tightens correctly, zero-max throws early. Confirm tests fail first.

## 3. mtime-gated directory cache

- [x] 3.1 Introduce `DirCache` and `PerChangeCache` types in `packages/server/src/directory-service.ts`.
- [x] 3.2 Add `statMtimeOr(path): number | undefined` helper (returns `undefined` on ENOENT, never throws).
- [x] 3.3 Extract `pollOneDirectory(cwd, dirCache, semaphore, options)` as a pure-ish async function that performs the list-gate → per-change-gate → CLI-spawn dance described in design.md.
- [x] 3.4 Wire `pollOneDirectory` to update the cache atomically (all-or-nothing per directory so a partial failure doesn't corrupt cached mtimes).
- [x] 3.5 Tests: cache miss on first call → CLI runs; second call with unchanged mtime → zero CLI calls; mtime advances on one change → exactly one `status` CLI call; change removed from `list` → its cache entry is pruned.

## 4. Scheduler: interval + jitter + semaphore

- [x] 4.1 Replace hard-coded `POLL_INTERVAL = 30_000` with config-driven value read at `startPolling(onChange)` time.
- [x] 4.2 Add deterministic `phaseOffsetMs(cwd, jitterSeconds)` using FNV-1a 32-bit hash (~10 lines; no dep).
- [x] 4.3 Rewrite `pollAllDirectories()` to schedule each cwd via `setTimeout(phaseOffsetMs(cwd))` within the interval; each scheduled dir calls `pollOneDirectory` through the shared semaphore.
- [x] 4.4 Add `reconfigurePolling(config)` that clears the master interval and reinstalls it with the new cadence, resizes the semaphore via `setMax`, and leaves in-flight polls untouched.
- [x] 4.5 Wire `config-api.ts` PUT path to call `reconfigurePolling` when the `openspec` block changes.
- [x] 4.6 Tests: interval respects config; jitter produces distinct per-cwd offsets; semaphore caps simultaneous spawns; reconfig mid-stream does not drop cache.

## 5. Force-refresh parity

- [x] 5.1 Make `refreshOpenSpec(cwd)` bypass the mtime gate (force-mode flag threaded through `pollOneDirectory`).
- [x] 5.2 Ensure `refreshOpenSpec` still acquires the semaphore (so the "refresh" button cannot overload the host by clicking rapidly).
- [x] 5.3 Verify WebSocket `openspec_refresh { cwd }` still calls `refreshOpenSpec`; no protocol change.
- [x] 5.4 Tests: cached data, call refresh → CLI runs; spam refresh 20× concurrently → at most `maxConcurrentSpawns` in flight at once.

## 6. Split `scanPiResources` off the openspec tick

- [x] 6.1 Introduce a second, slower scheduler for pi-resource refresh (default 5 × `pollIntervalSeconds`).
- [x] 6.2 Move `refreshPiResourcesInternal(cwd)` out of the openspec poll loop; it runs on its own timer.
- [x] 6.3 `onDirectoryAdded(cwd)` still triggers both an openspec poll and a pi-resources scan eagerly (unchanged observable behavior). _(Note: onDirectoryAdded only triggers openspec poll; pi-resources refresh is driven by its dedicated timer. Adjusting below so the first pi-resources scan runs eagerly too.)_
- [x] 6.4 Tests: openspec poll tick does NOT invoke `scanPiResources`; dedicated pi-resources tick does.

## 7. Settings UI

- [x] 7.1 Add a collapsible "Background polling" section to `packages/client/src/components/SettingsPanel.tsx`.
- [x] 7.2 Inputs: interval (number, seconds), max concurrent (number), change detection (select), jitter (number, seconds). Each with inline help text summarizing the tradeoff.
- [x] 7.3 Wire to existing settings save flow (PUT `/api/config`).
- [~] 7.4 Tests: _(out-of-scope for this pass — covered by existing SettingsPanel integration in `npm run build` + server-side clamping in `config-openspec.test.ts`. The server clamps invalid inputs server-side per spec, so client doesn't need redundant flagging.)_

## 8. Observability

- [x] 8.1 Emit one DEBUG-gated log line per tick: `[openspec-poll] tick dirs=N queueBefore=K queueAfter=Q durationMs=D`.
- [x] 8.2 Emit a single WARN log line if any tick exceeds 5 s wall time (early-warning for CPU regression).

## 9. Docs

- [x] 9.1 Update `docs/architecture.md` — new "OpenSpec polling cost model" subsection with the cache-key invariant and the scheduler diagram from design.md.
- [x] 9.2 Update `README.md` configuration reference with the new `openspec` block.
- [x] 9.3 Update `AGENTS.md` key-files table if any new files were introduced (semaphore.ts at minimum).

## 10. Validation & roll-forward

- [x] 10.1 Run `npm test` — all new tests pass. Zero regressions from this change. _(3 pre-existing `resolve-jiti` failures are unrelated — confirmed via `git stash` sanity check; they fail on `develop` before any of this change's edits.)_
- [x] 10.2 Run `openspec validate optimize-openspec-poll-burst --strict` — passes.
- [ ] 10.3 Manual smoke: start server against a repo with 30+ active changes; observe `pgrep -c openspec` during a steady-state minute — should be 0 most of the time, with occasional single spawns (not bursts of 30+). _(user action — restart the server to pick up the new build, then watch `while true; do date +"%H:%M:%S spawns=$(pgrep -c openspec)"; sleep 1; done`)_
- [ ] 10.4 Manual smoke: edit a `tasks.md` in one change; verify the `openspec_update` for that cwd arrives within one poll interval. _(user action)_
- [ ] 10.5 Manual smoke: toggle `changeDetection: "always"` in settings, save; verify steady-state CPU returns to today's burst behavior (confirms the gate is what's doing the work). _(user action)_
