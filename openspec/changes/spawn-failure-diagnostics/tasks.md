## 1. Shared protocol + config additions

- [ ] 1.1 Add `SpawnFailureCode` string-literal union and `PreflightReason` interface to `packages/shared/src/browser-protocol.ts`
- [ ] 1.2 Extend `spawn_error` message type with optional `code?: SpawnFailureCode` and `reasons?: PreflightReason[]`
- [ ] 1.3 Add new `spawn_register_timeout` message type `{ type, cwd, pid?, stderrTail? }` (pid optional for tmux/wt) and `spawn_register_recovered` message `{ type, cwd, pid? }` to the union
- [ ] 1.4 Add `spawnRegisterTimeoutMs?: number` to `packages/shared/src/config.ts` schema; default 30000; clamp `[5000, 120000]` at read; NaN/non-number falls back to default
- [ ] 1.5 Add unit test in `packages/shared/src/__tests__/config.test.ts` (or new file) covering default/in-range/below/above/NaN cases
- [ ] 1.6 Verify `tsc --noEmit` passes across all workspace packages

## 2. process-manager: classify every failure

- [ ] 2.1 Extend `SpawnResult` in `packages/server/src/process-manager.ts` with optional `code?: SpawnFailureCode`, `stderr?: string`, `logPath?: string`
- [ ] 2.2 Update `spawnPiSession` cwd-missing return → `code: "DIR_MISSING"`
- [ ] 2.3 Update `spawnTmux` failure → `code: "TMUX_MISSING"`
- [ ] 2.4 Update `spawnWslTmux` failure → reuse `code: "TMUX_MISSING"` with mechanism note in message
- [ ] 2.5 Update `spawnWt` `wt` missing → `code: "WT_MISSING"`; pi missing → `code: "PI_NOT_FOUND"`
- [ ] 2.6 Update `spawnHeadless` (Unix wrapper) failures → `code: "PI_NOT_FOUND"` (no pi) and `code: "SPAWN_ERRNO"` (spawnDetached error)
- [ ] 2.7 Update `spawnHeadlessDetached` (Windows): pi.cmd-only → `code: "WIN_PI_CMD_ONLY"`; spawnDetached error → `code: "SPAWN_ERRNO"`; waitForNoCrash !ok → `code: "PI_CRASHED"`
- [ ] 2.8 In `spawnHeadlessDetached`, on `PI_CRASHED`, read last 4096 bytes of `logPath` (utf-8 boundary-safe) and assign to `result.stderr`; swallow read errors
- [ ] 2.9 In `spawnHeadlessDetached`, return `logPath` on both success and failure for watchdog handoff
- [ ] 2.10 Add unit test `process-manager-codes.test.ts` enumerating each failure path with mocked deps and asserting `code` is set

## 3. spawn-preflight module

- [ ] 3.1 Create `packages/server/src/spawn-preflight.ts` exporting `preflightSpawn(cwd, deps?)` and `PreflightResult`/`PreflightReason` types
- [ ] 3.2 Implement five checks (DIR_MISSING, DIR_NOT_DIRECTORY, DIR_NOT_WRITABLE, PI_NOT_FOUND, NODE_NOT_FOUND); accumulate all reasons (no short-circuit)
- [ ] 3.3 Document and assert that the accepted resolver MUST have `useLoginShell: false`; if a resolver with `useLoginShell: true` is passed, the function SHALL still run but emit a `console.warn` once (lint rather than reject)
- [ ] 3.4 Add `packages/server/src/__tests__/spawn-preflight.test.ts` with memfs-backed table-driven cases including multi-failure accumulation; assert no login-shell spawn occurs (mock `whichViaLoginShell` and assert never called)

## 4. spawn-register-watchdog module

- [ ] 4.1 Create `packages/server/src/spawn-register-watchdog.ts` exporting class `SpawnRegisterWatchdog` with `arm({ pid?, cwd, mechanism, logPath?, ws })`, `clearByPid(pid)`, `clearByCwd(cwd)`; ctor reads `timeoutMs` from `config.spawnRegisterTimeoutMs` and clamps `[5000, 120000]`
- [ ] 4.2 Two internal maps: `byPid: Map<number, Entry>`, `byCwd: Map<string, Entry>`. Headless arms in `byPid`; tmux/wt/wsl-tmux arms in `byCwd` only. Both clears are idempotent. OPEN-readyState check before send
- [ ] 4.3 On timeout: read stderr tail from `logPath` if present, emit `spawn_register_timeout`, move entry into `recentlyFired: Map<cwd, { firedAt, pid?, ws }>` (60 s TTL eviction on access)
- [ ] 4.4 Late-clear path: `clearByPid` / `clearByCwd` checks `recentlyFired`; if hit and `ws` OPEN, emits `spawn_register_recovered`, deletes the entry
- [ ] 4.5 Hook `watchdog.clearByPid(pid)` AND `watchdog.clearByCwd(cwd)` into `packages/server/src/pi-gateway.ts` `session_register` handler; guard missing `pid`; both calls precede any throwing logic
- [ ] 4.6 Export module-level singleton `getSpawnRegisterWatchdog()` for handler access (lazy init, swappable in tests)
- [ ] 4.7 Add `packages/server/src/__tests__/spawn-register-watchdog.test.ts` with vitest fake timers covering: headless arm+clearByPid; tmux arm+clearByCwd; arm-then-fire; clear-unknown-key; closed-ws no-throw; stderrTail-on-timeout; late clearByCwd within 60s emits `spawn_register_recovered`; late clear past 60s is silent; clamp at lower/upper bound

## 5. spawn-failure-log module

- [ ] 5.1 Create `packages/server/src/spawn-failure-log.ts` exporting `appendSpawnFailure(entry)`, `readSpawnFailures(limit)`, `SpawnFailureEntry` type
- [ ] 5.2 NDJSON line writer with try/catch around fs ops (console.error on failure, never throw)
- [ ] 5.3 Single-shot rotation: `statSync().size > 10*1024*1024` → `renameSync(.log, .log.1)` then `appendFileSync(.log, line)`
- [ ] 5.4 `readSpawnFailures`: read both `.log.1` (older) and `.log` (newer), concatenate, parse line-by-line skipping malformed, return last `limit` (clamp 0..500, NaN → default)
- [ ] 5.5 Add `packages/server/src/__tests__/spawn-failure-log.test.ts` with tmpdir covering append, rotation at threshold, malformed-line skip, missing-file empty, limit clamping

## 6. session-action-handler integration

- [ ] 6.1 Construct preflight resolver inline as `new ToolResolver({ processExecPath: process.execPath, useLoginShell: false })` and call `preflightSpawn(msg.cwd, { resolver })` at the top of `handleSpawnSession`
- [ ] 6.2 If `!preflight.ok`: send `spawn_result { success: false, message: <reasons joined> }` + `spawn_error { code: "PREFLIGHT_FAILED", reasons }`; append failure to log; return early (no `spawnPiSession` call)
- [ ] 6.3 After successful spawn: call `watchdog.arm({ pid, cwd, mechanism, logPath: result.logPath, ws })`. Headless includes `pid`; tmux/wt/wsl-tmux pass `pid: undefined`
- [ ] 6.4 On `spawn_result.success === false`: forward `code` and `stderr` in the `spawn_error` message; append entry to failure log with full context
- [ ] 6.5 On thrown `spawnPiSession` exception: append `code: "SPAWN_ERRNO"` entry
- [ ] 6.6 In watchdog timeout callback (set up at handler init): append `code: "REGISTER_TIMEOUT"` entry to log
- [ ] 6.7 Add `packages/server/src/__tests__/session-action-handler-spawn.test.ts` with stub `spawnPiSession` for each code → assert emitted message + log entry; include tmux-arm-by-cwd and headless-arm-by-pid cases

## 7. REST endpoint

- [ ] 7.1 Register `GET /api/spawn-failures` in `packages/server/src/routes/system-routes.ts`
- [ ] 7.2 Parse `limit` query (default 50, max 500, NaN→default), call `readSpawnFailures(limit)`, return `{ entries }`
- [ ] 7.3 No auth-bypass entry — relies on existing Fastify auth plugin
- [ ] 7.4 Add route test in `packages/server/src/__tests__/system-routes.test.ts` (or new file) covering default/custom/clamped/NaN limit + missing-log

## 8. Client UI

- [ ] 8.1 Add code→hint mapping table to spawn-error banner component (locate via grep `spawn_error` in `packages/client/src/`)
- [ ] 8.2 Render `code` hint label + per-code optional CTA button (Open Setup Wizard / View log)
- [ ] 8.3 Render `reasons` list when `code === "PREFLIGHT_FAILED"`
- [ ] 8.4 Render `stderr` inside collapsed `<details><summary>Pi stderr</summary><pre>…</pre></details>`
- [ ] 8.5 Add `spawn_register_timeout` handler in client message router → push distinct banner per `cwd` with PID (when present) + stderrTail; banner label uses configured timeout in seconds (e.g. "30s")
- [ ] 8.6 Add `spawn_register_recovered` handler → auto-clear matching timeout banner for that `cwd` (no user dismissal required)
- [ ] 8.7 Clear timeout banner on subsequent `spawn_result.success === true` for same `cwd` (existing rule extended)
- [ ] 8.8 Add `spawnRegisterTimeoutMs` numeric input to `SettingsPanel.tsx` under Sessions group; label "Spawn register timeout (ms)"; helper text mentions default 30000 and range 5000–120000; validate in-range integer; block Save on invalid
- [ ] 8.9 Surface last 50 spawn failures in Settings → Tools (or nearest existing diagnostics panel) via `GET /api/spawn-failures`; collapsed list with per-row code/cwd/timestamp/expand-for-stderr
- [ ] 8.10 Manual visual verification with `browser-visual-debug` skill across light/dark themes

## 9. Docs and indexing (delegate every `docs/` write to a general-purpose subagent in caveman style per AGENTS.md)

- [ ] 9.1 Update `docs/file-index-server.md` with new files: `spawn-preflight.ts`, `spawn-register-watchdog.ts`, `spawn-failure-log.ts` — caveman style, alphabetical
- [ ] 9.2 Update `docs/file-index-shared.md` row for `browser-protocol.ts` and `config.ts` if rows exist; otherwise leave (additive)
- [ ] 9.3 Update `docs/file-index-client.md` row for the spawn-error banner component and `SettingsPanel.tsx`
- [ ] 9.4 Add FAQ entry under `docs/faq.md`: "How do I see why a session spawn failed?" pointing at the banner + Settings list + `/api/spawn-failures`
- [ ] 9.5 Create `docs/todo.md` (new file) with two queued items in caveman style:
  - `Unix headless stderr capture. Currently sh -c "tail -f /dev/null | pi" with stdio: ignore. Add 2>>~/.pi/dashboard/sessions/pi-spawn-*.log redirect or switch to logFd model. Mac/Linux PI_CRASHED returns no stderr today.`
  - `/api/spawn-failures auth posture. Endpoint relies on global Fastify auth plugin; on default local install with no auth + zrok exposure, anyone reaching dashboard can read cwd paths. Add per-endpoint auth-required override or path redaction.`
- [ ] 9.6 Update `README.md` security section: add note that `/api/spawn-failures` is reachable to any caller in deployments without auth and entries contain `cwd` paths; recommend enabling auth before exposing via tunnel
- [ ] 9.7 No AGENTS.md change unless a new architectural backbone file emerges (likely: none qualify per the ≤200-char rule)

## 10. Release readiness

- [ ] 10.1 `npm test` green; tee to `/tmp/pi-test.log` and grep FAIL/Error
- [ ] 10.2 `npm run build` succeeds for client
- [ ] 10.3 `curl -X POST http://localhost:8000/api/restart` and verify health = "ok"
- [ ] 10.4 `npm run reload` to refresh bridge in connected pi sessions
- [ ] 10.5 Smoke: trigger each failure mode locally (delete cwd; rename pi; force pi crash via env var) and verify banner + log entry per code
- [ ] 10.6 Run `openspec verify spawn-failure-diagnostics` (via `openspec-verify-change` skill) before archive
