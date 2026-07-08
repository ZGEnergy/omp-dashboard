# Tasks — add-goal-session-supervisor

## 1. Types & store (foundation)
- [ ] 1.1 Extend `GoalRecord` (`packages/shared/src/types.ts`): `autoRespawn?: boolean`, `respawns?: GoalRespawn[]`, `status` gains `"failed"`; add `GoalRespawn` type. → verify: `tsc --noEmit` clean, shared build passes.
- [ ] 1.2 `goal-store.ts`: persist `autoRespawn` + `respawns` (FIFO-capped), make `turnsUsed` cumulative on the record, add `recordRespawn` / `setStatus("failed")`. Legacy `GoalsFile` records load unchanged. → verify: unit test load-old-record + append-respawn cap.
- [ ] 1.3 `GoalPluginSettings`: add `autoRespawnDefault` (default off); new goals inherit it. → verify: unit test default inheritance.

## 2. Reuse host session management (no new mechanism)
- [ ] 2.1 RENAME `abortAutomationRun` → `abortSpawnedRun` across `dashboard-plugin-runtime/src/server/server-context.ts` (type + field + doc), host wiring in `packages/server/src/server.ts`, and the automation caller (`automation-plugin/src/server/{index,engine}.ts`). Mechanical, no behavior change. → verify: `tsc --noEmit` clean repo-wide; automation stop-run tests still green.
- [ ] 2.2 Correlation: capture the `spawnToken` returned by `ctx.spawnSession` in the goal spawn path (`goal-routes.ts` / `spawnGoalSession`) and stamp `goalId` via the host's existing token correlation (`linkByToken` in `event-wiring.ts`), replacing `pendingGoalLinkRegistry.consume(cwd)` as the PRIMARY link path. Keep the host's cwd-FIFO only as its existing legacy fallback. → verify: unit test — same-cwd non-goal session not linked; overlapping goal respawns don't cross-link.
- [ ] 2.3 Subscribe the goal server to `ctx.onSessionEnded` (the rail automation already rides). → verify: unit test the subscription fires the supervisor for a driver session.

## 3. Supervisor core (`packages/server/src/goal-supervisor.ts`) — goal POLICY only
- [ ] 3.1 Classify death (terminal / paused / respawn) per spec; ignore non-active goals. → verify: unit test each branch.
- [ ] 3.2 Progress signal (`turnsUsed↑ OR new verdict since spawn`); reset counters/backoff on progress. → verify: unit test progress vs no-progress.
- [ ] 3.3 Respawn: resume-first via host `resume_session` (`--resume driverSessionId`); fresh-fallback after `K=2` no-progress resume-deaths (re-prime `/goal <objective>` + verdict summary). → verify: unit test resume path + poison fallback.
- [ ] 3.4 Backoff `5s→15s→45s` cap between respawns; reset on progress. → verify: unit test backoff sequence + reset.
- [ ] 3.5 Crash-loop breaker: `3` no-progress deaths / rolling `5min` → `status=failed` reason `"crash loop"`, silent, no further respawn. → verify: unit test trip + progress-prevents-trip.
- [ ] 3.6 Abort: on `clear`/`pause` call `ctx.abortSpawnedRun({spawnToken|sessionId})` (host primitive), then set terminal status before respawn; idempotent. Stash the in-flight `spawnToken` on the record for this. → verify: unit test abort-in-spawn-window + concurrent pause/respawn = one outcome.
- [ ] 3.7 Reaper: 60s sweep, `active` goal + no turn advance in `maxAge` → synthesize no-progress death down the same path. → verify: unit test hung-driver reaped.
- [ ] 3.8 Restart quiesce: honor the existing `server_restarting` broadcast; defer + reconcile after. → verify: unit test deferral + post-window reconcile.

## 4. Budget integration
- [ ] 4.1 Route `decideBudgetHalt` off cumulative `GoalRecord.turnsUsed`; halt applies across respawns. → verify: unit test budget halts despite per-session reset.

## 5. Client surfaces
- [ ] 5.1 `GoalChip` / board: `↻ Respawning n/m` and `✕ Failed · crash loop` states. → verify: component test both states render.
- [ ] 5.2 Create/edit form: `autoRespawn` toggle (default from settings). → verify: component test toggle persists.

## 6. Discipline checkpoints
- [ ] 6.1 `doubt-driven-review` before the respawn path stands: confirm breaker + cumulative budget + opt-in default-off make runaway spend impossible.
- [ ] 6.2 `observability-instrumentation`: respawn attempts + breaker trips logged; supervisor state visible on chip/board.

## 7. Docs
- [ ] 7.1 (delegate to docs subagent, caveman style) `packages/server/src/AGENTS.md` row for `goal-supervisor.ts`; update `goal-store.ts` + `event-wiring.ts` + `goal-routes.ts` rows; note the `abortAutomationRun`→`abortSpawnedRun` rename on `server.ts` + `dashboard-plugin-runtime` server-context rows; one-line note in `docs/architecture.md` on host-mechanism / goal-policy split + `See change: add-goal-session-supervisor`.

## 9. Doubt-review corrections (cycle 1: Claude + GPT-5.5) — must land
- [ ] 9.1 (S1) `GoalRecordStatus` add `respawning` + `failed`; use real vocab (`pursuing`/`achieved`, not `active`/`done`) at every match site. During backoff the goal is `respawning`, not `pursuing`. → verify: unit test no `pursuing` state without a live driver.
- [ ] 9.2 (S2) Supervisor is main-server `goal-supervisor.ts` hooking `sessionManager.onUnregister` with direct `GoalStore` + `spawnPiSession` — NOT plugin `ctx.onSessionEnded` (plugin server can't reach the store). → verify: supervisor unit test uses store directly.
- [ ] 9.3 (S3) Resume via `spawnPiSession` continue-mode (`sessionFile` resolved from `driverSessionId`); there is NO `--resume` flag. Fresh-spawn fallback if the session file is gone. → verify: unit test resolves file + continue-mode args.
- [ ] 9.4 (S4) Stamp `goalId` INTO the host spawn call BEFORE launch, keyed to the spawn token; supervisor spawn with a missing token at register PAUSES the goal, never cwd-links. → verify: unit test no-token → paused, not linked.
- [ ] 9.5 (S5) Add `goalStore.replaceDriver(cwd,id,newSessionId)`; respawn sets the new driver even though the dead `driverSessionId` is still set. → verify: unit test driver replaced.
- [ ] 9.6 (S6) Abort ordering: bump per-goal `generation` + write terminal status synchronously, cancel pending timer/spawn (generation-checked), THEN host kill; kill-returns-false → `stopping_failed`, no respawn. → verify: unit test kill→onUnregister no-op + timer-after-clear cancelled + kill-false path.
- [ ] 9.7 (S7) Progress = strict `turnsUsed` increase only; buffer `lastKnownTurnsUsed` on the record. → verify: unit test first-seen/zero snapshot is NOT progress.
- [ ] 9.8 (S8) Breaker counter derives from persisted `respawns[]` (survives restart). → verify: unit test counter reconstructed after reload.
- [ ] 9.9 (S9) Reaper gated on `session.status`/`currentTool`, or cut for v1. → verify: unit test busy driver not reaped (if shipped).
- [ ] 9.10 (S10) Boot-time reconcile replaces restart-quiesce: on startup, `respawning`/`pursuing` goal with non-live driver runs classify once. → verify: unit test orphan reconciled, live-driver goal untouched.
- [ ] 9.11 (S11) Concrete re-prime prompt (objective + criteria + cumulative verdict summary + budget/judge) + capability probe of `@ricoyudog/pi-goal-hermes` for resume/cold-start; disable auto-respawn if unsupported. → verify: probe test + disabled-path log.
- [ ] 9.12 (S12) Drop "SILENT" wording: no push notification, `failed` shown on chip/board; optional single terminal-failure event. → verify: chip shows failed.
- [ ] 9.13 (S14/trade-off) Reconsider `abortAutomationRun` rename vs alias-and-deprecate `abortSpawnedRun` to avoid a big-bang caller update. → decision recorded in design D8.

## 10. Doubt-review corrections (cycle 2: GPT-5.5) — must land
- [ ] 10.0 (P0, PREREQUISITE) Build durable status+progress persistence FIRST: a component maintains `GoalRecord.status` transitions + `lastKnownTurnsUsed` + `totalTurnsUsed` + `lastProgressAt` from the live `goal_status` stream (today the accumulator only appends verdicts). Respawn logic depends on this. → verify: unit test durable status/turns updated from snapshot stream.
- [ ] 10.1 (C2a) Subscribe via existing `dispatchPluginSessionEnded` fanout; never reassign `sessionManager.onUnregister`. → verify: existing plugin-death dispatch still fires.
- [ ] 10.2 (C2b) `goalStore.listAll()`/`scanFiles()` for boot reconcile; persist in-flight respawn token+goalId so restart mid-respawn does not double-spawn. → verify: unit test enumerate-all + no double-spawn.
- [ ] 10.3 (C2c) Persist `{goalId}` on the host headless/pid registry entry, consumed by `spawnToken` at register (no in-memory-only map). → verify: unit test goalId survives restart.
- [ ] 10.4 (C2d) Mint spawn token BEFORE launch, store synchronously, pass into `spawnPiSession`; stale-generation completion kills the returned process. → verify: unit test clear-during-spawn kills the late process.
- [ ] 10.5 (C2e) Gate every goal snapshot + death on `sessionId === driverSessionId`; clear old driver `goalId` in `replaceDriver`. → verify: unit test late old-driver snapshot ignored.
- [ ] 10.6 (C2f) Pre-launch zero turn baseline + `unknown-progress` class for crash-while-busy-before-snapshot (not counted as no-progress). → verify: unit test no maxTurns evasion + busy-crash not breaker-counted.
- [ ] 10.7 (C2g) Breaker counts only no-progress deaths after persisted `breakerEpoch`/`lastProgressAt`; progress bumps the epoch. → verify: unit test stale pre-progress deaths excluded.
- [ ] 10.8 (C2h) Abort = single awaited `GoalStore.update` (generation++ + terminal status) BEFORE kill; death handler re-reads after. → verify: unit test kill-death is no-op.
- [ ] 10.9 (C2i) Close the status union end-to-end (shared type + REST validation + `statusMeta` + board filters + detail + tests) for `failed`/`respawning` (+ decide `stopping_failed` vs `paused`+operationState). → verify: unknown-status never renders as Pursuing; filters include new states.
- [ ] 10.10 (C2j) Respawn forces `strategy:"headless"`; disable auto-respawn if headless RPC unavailable. → verify: unit test headless strategy enforced.

## 8. Verify & ship
- [ ] 8.1 `npm run quality:changed` green (biome + tsc + tests).
- [ ] 8.2 `openspec validate add-goal-session-supervisor --strict` passes.
- [ ] 8.3 Manual: create autoRespawn goal, kill its driver, observe resume; force 3 no-progress deaths, observe `failed` on chip; clear during spawn window, observe process killed + no respawn; restart server mid-pursuit, observe boot reconcile.
