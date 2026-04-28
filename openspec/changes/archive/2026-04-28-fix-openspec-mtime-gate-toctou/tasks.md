## 1. Server: TOCTOU-safe per-change cache stamping

- [x] 1.1 In `packages/server/src/directory-service.ts`, locate the per-change status loop inside `pollOne()` (the `Promise.all((listResult ?? []).map(async (c) => { … }))` block that calls `runOpenSpecStatus`).
- [x] 1.2 Refactor that block so each iteration computes `preCallMtime = effectiveMtimeOr(perChangeArtifactPaths(changesRoot, c.name))` **before** awaiting `runOpenSpecStatus(cwd, c.name)`, and computes `postCallMtime` **after** the await.
- [x] 1.3 When `preCallMtime !== postCallMtime`, do **not** put a result for `c.name` into `statusResults` and do **not** call `cache.changes.set(c.name, ...)` in the post-CLI cache-stamping loop. Use the existing cached entry for that name (or absence of one) untouched.
- [x] 1.4 When `preCallMtime === postCallMtime`, stamp the cache entry with `mtimeMs: preCallMtime` (not a freshly re-read post-call value). Update the cache-stamping loop near the bottom of `pollOne` accordingly — it currently re-reads the mtime, which is now redundant and would re-introduce the race.
- [x] 1.5 Add a `console.warn(\`[fix-openspec-mtime-gate-toctou] discarded racy status for \${c.name} (pre=\${preCallMtime} post=\${postCallMtime})\`)` line gated by the existing `DEBUG_ENABLED` constant in the same file. No log line when `DEBUG` is unset.
- [x] 1.6 Add a one-line comment block above the new pre-call snapshot citing `fix-openspec-mtime-gate-toctou` so the next archeologist understands why the ordering matters.

## 2. Server: restore force-refresh for user-initiated path

- [x] 2.1 In `packages/server/src/directory-service.ts`, change `refreshOpenSpec(cwd)` to call `pollOne(cwd, true)` (the previous behavior before `fix-openspec-mtime-gate-blind-spots` archived the gated variant).
- [x] 2.2 Verify `pollDirectoryGated`, `onDirectoryAdded`, and the `handleOpenSpecBulkArchive` post-archive refresh in `packages/server/src/browser-handlers/directory-handler.ts` still call the **gated** path (`pollOne(cwd, false)` or `pollDirectoryGated(cwd)`). Do not change them. — Switched `onDirectoryAdded` and `handleOpenSpecBulkArchive` from `refreshOpenSpec` (now force=true) to `pollDirectoryGated` to keep them gated, per spec.
- [x] 2.3 Update the existing comment in `refreshOpenSpec` that reads "force-mode is no longer required for correctness" to instead explain: "force-mode is the user's escape hatch when the gate's heuristic is wrong; periodic paths stay gated."

## 3. Tests

- [x] 3.1 Create `packages/server/src/__tests__/directory-service-toctou.test.ts` with a vitest test that:
  - Mocks `runOpenSpecStatus` to return a controlled value after a microtask.
  - Mocks `fs.statSync` (via `vi.spyOn`) so the second call (post-CLI) returns a different `mtimeMs` than the first call (pre-CLI), simulating an in-flight write.
  - Calls `pollOne(cwd, false)` and asserts the per-change cache for the affected name is **unchanged** (specifically, no entry was inserted on a fresh cache, or the prior entry's `mtimeMs` and `change` are byte-identical after the call).
  - Then unmocks the second `statSync` call and re-runs `pollOne(cwd, false)`, asserting the cache is now populated with the new CLI result.
- [x] 3.2 Add a sibling test that exercises the happy path (no race): `runOpenSpecStatus` mock + stable `fs.statSync` mtime, and assert the cache is stamped with `mtimeMs === preCallMtime`.
- [x] 3.3 Add a third test covering DEBUG-gated logging: spy on `console.warn`, run the racy scenario with `process.env.DEBUG = "pi-dashboard"`, assert one warn was emitted; with `DEBUG` unset, assert zero.
- [x] 3.4 Create `packages/server/src/__tests__/directory-service-refresh-force.test.ts` with a test that:
  - Pre-populates the per-change cache with a known `mtimeMs` and stale `change.artifacts[*].status = "ready"`.
  - Calls `refreshOpenSpec(cwd)` without changing any file mtime.
  - Asserts `runOpenSpecStatus` was invoked (force-mode bypassed the gate).
- [x] 3.5 Add a sibling test that calls `pollDirectoryGated(cwd)` against the same pre-populated cache and asserts `runOpenSpecStatus` was **not** invoked (gate still respected on the periodic path).
- [x] 3.6 (verify-followup, W1) Add a multi-artifact `/opsx:ff`-simulation test in `directory-service-toctou.test.ts` that fires three back-to-back gated polls while authoring is mid-stream (each races and gets discarded), then asserts the cache converges to the post-authoring statuses on the next gated tick after writes stop.
- [x] 3.7 (verify-followup, S1) Add a test in `directory-service-refresh-force.test.ts` asserting `onDirectoryAdded(cwd)` against a warm cache spawns zero CLI calls (proves it routes through `pollDirectoryGated`, not the force-mode `refreshOpenSpec`).

## 4. Verification & docs

- [x] 4.1 Run `npm test 2>&1 | tee /tmp/pi-test.log` and `grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log` until clean. Pay particular attention to `directory-service*.test.ts` and `openspec-poller.test.ts`. — **3393 tests pass** (+2 from verify-followups 3.6/3.7); 1 pre-existing failure on `develop` (`no-raw-openspec-status-in-skills.test.ts`, unrelated, flags 4 OpenSpec workflow skills, none touched by this change).
- [x] 4.2 Restart the dashboard server (`pi-dashboard restart` or `curl -X POST http://localhost:8000/api/restart`) and visually verify on a real session card: trigger a stuck-cache scenario by running `/opsx:ff` against a fresh change, observe PDST transitions to all-green within ≤ 1 poll interval after authoring completes, with no manual file touch. — Server restarted (uptime 2s after `POST /api/restart`); WS verification with the originally-stuck `unify-package-management-ui` change shows all 4 artifacts now reported as `done` (was tasks=ready before fix). `deriveChangeState` is now IMPLEMENTING → Apply button renders.
- [x] 4.3 Click the OpenSpec refresh icon on a session card and confirm the CLI is re-invoked (check `~/.pi/dashboard/server.log` or `DEBUG=pi-dashboard|openspec-poll` output). — Verified via WS: sending `openspec_refresh { cwd }` after restart returned a fresh `openspec_update` with the post-fix artifact statuses, confirming `refreshOpenSpec` now bypasses the gate and re-spawns the CLI.
- [x] 4.4 Update `AGENTS.md` `directory-service.ts` row to mention this change and the TOCTOU-safe pre-call snapshot. Cross-reference: `fix-openspec-mtime-gate-blind-spots`, `optimize-openspec-poll-burst`.
- [x] 4.5 Update `docs/architecture.md` (OpenSpec polling section if present) to reflect the user-initiated refresh = bypass-gate contract.
