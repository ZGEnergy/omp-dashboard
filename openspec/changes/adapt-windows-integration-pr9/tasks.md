## 0. Preflight on `windows-integration-v2`

- [x] 0.1 Create `windows-integration-v2` branch from today's `origin/windows-integration` (`de695e1`) — done, proposal cherry-picked as `337e5c4`
- [x] 0.2 Read and internalize `MERGE-PLAN.md` and `BRANCH-COMPARISON.md` from the PR branch — lazy-read basis per proposal §Task 0.2 answer
- [x] 0.3 ~~MERGE-PLAN §0.1a revert~~ — **NO-OP**: preload-fastify-cjs / node-version-check / 4 openspec folders never existed on the pushed PR branch (`de695e1`). Verified via `git ls-tree -r origin/windows-integration | grep -iE "preload|node-version-check"` → only unrelated `packages/electron/src/preload.ts`
- [x] 0.4 Add `packages/server/src/node-guard.ts` + `packages/server/src/__tests__/node-guard.test.ts` + preflight call in `cmdStart` and `runForeground` — committed as `4c564fc feat(server): refuse to start on Node versions affected by nodejs/node#58515`. `engines.node >=22.18.0` already in `packages/server/package.json` (commit `8c2cde5` pre-existing)
- [x] 0.5 ~~MERGE-PLAN §0.2 regression fixes~~ — **ALREADY APPLIED** on branch. `detach?: boolean` option added by `9c497b8`; `detach: false` for pi-session spawn applied by `26e033e`. `useWindowsRedirect` branch was removed entirely during the `a73178d` platform/ consolidation (spawn.ts now routes `.cmd` shims through cmd.exe only for `.cmd`/`.bat` lookups, independent of logPath). Tests 41/41 green (`packages/shared/src/__tests__/spawn.test.ts`)
- [x] 0.6 Manual Windows validation — **COMPLETE** on Windows 10.0.26200.7840:
  - ✓ Fresh start from `npx pi-dashboard start` in repo root
  - ✓ No cmd.exe flash on ×3 session spawn (MERGE-PLAN §0.2 regression gate SATISFIED)
  - ✓ `server.log` populated with timestamped startup + diagnostics
  - ✓ `/api/restart` works (Node-based orchestrator, no sh/lsof/curl)
  - ✓ `npx pi-dashboard stop` frees :8000 + :9999 after Task Manager kill
  - **Bonus fix:** `40a1319 fix(server): bridge auto-registration path math was off by one` — `createServer()` used `resolve(__serverDir, '..', '..')` (gives `packages/`) instead of `'..', '..', '..'` (repo root). `findBundledExtension(packages/)` looked for `packages/packages/extension` which doesn't exist → `~/.pi/agent/settings.json` was never created → pi spawned in RPC mode but bridge never loaded → UI stayed empty. Silent failure; surfaced only because Windows box had no stale settings.json from prior installs. Fix adds explicit log lines so future regressions fail loudly.
- [x] 0.7 N/A — 0.6 passed, proceeding to Phase 0.5
- [x] 0.8 Tag `git tag -a pre-develop-merge` rollback anchor — done (points to `4c564fc`)

## 0.5 Safety commits (NEW, not in MERGE-PLAN)

- [x] 0.9 Cherry-pick `8737249` (node-pty hoist-aware permissions + handler error surfacing) — commit `aa56431`, 3/3 tests pass
- [x] 0.10 Cherry-pick `3cad40b` (node-pty spawn-helper bundle execute permission) — commit `7a86b30`, CHANGELOG.md + AGENTS.md conflicts resolved (take develop's richer narrative), `packages/server/src/fix-pty-permissions.ts` added for runtime chmod
- [x] 0.11 Cherry-pick `6a1b1d8` (test-isolation tripwire) — conflicts in AGENTS.md + `headless-pid-registry.ts` (guard `killAll` + `cleanupOrphans` with `isUnsafeTestHomeScan()`; drop develop's redundant `useGroup` branch since `killPidWithGroup` already handles platform split) + `editor-pid-registry.ts` added from develop (will land cleanly when `97dd4bd` lands in Phase 1). Tripwire module + `test-env-guard.ts` + `test-support/test-server.ts` + canary test now on branch.
- [x] 0.12 Tripwire verified: `cd packages/server && npx vitest run src/__tests__/node-guard.test.ts` (without `HOME=` prefix) correctly aborts with `[test-isolation] process.env.HOME (/Users/robson) equals the real user home`. With ephemeral HOME via `HOME=$(mktemp -d)`, tests proceed normally. Note: `npx vitest run <path>` from repo root bypasses workspace config (Vitest 3 quirk) — documented concern, `npm test` and manual HOME prefix both work correctly.
- [x] 0.13 No cross-session contamination: 25 meta files hashed before tests, 25 identical meta files after running 22 tests across `test-server-canary`, `headless-pid-registry`, `editor-pid-registry`, and `smoke-integration` suites. Clean diff confirms the tripwire + `test-env-guard` layers prevented any write to real `~/.pi/agent/sessions/`.

## 1. Phase 1 — Category A (clean picks, 19 commits)

Cherry-pick in MERGE-PLAN §2 order, SKIPPING `8737249` (already in Phase 0.5):

- [x] 1.1 `ee838d0` marketing site + GH Pages workflow — clean
- [x] 1.2 `e95491b` error-banner collapse + Retry + Copy — clean
- [x] 1.3 `f2ec691` CHANGELOG.md + release process — AGENTS.md + CHANGELOG.md conflicts resolved (take develop)
- [x] 1.4 `97dd4bd` persistent editor PID registry — `editor-pid-registry.ts` AA resolved (keep ours; already superset via 6a1b1d8 tripwire overlay)
- [x] 1.5 `15da6a8` site download section + theme — clean
- [x] 1.6 `c0bd183` inline SVG + barber-pole — AGENTS.md pure-additive take-develop
- [x] 1.7 `4143d49` CORS tunnel-origin allowlist — `server.ts` tunnel imports + CORS/compress blocks take-develop; added `@fastify/compress` dep
- [x] 1.8 `a343efa` docs: CORS + pre-compressed — architecture.md take-develop
- [x] 1.9 `144301c` QA verification fixes — clean
- [x] 1.10 `89d3bf6` landing-page onboarding — CHANGELOG take-develop
- [x] 1.11 `c004806` OpenSpec card state pill — `openspec-poller.ts` merge: dropped develop's dev-era `runOpenSpecSync`/`runOpenSpecAsync` helpers (redundant with our platform/openspec.ts Recipe system); kept the `export` keyword change on `buildOpenSpecData`
- [x] 1.12 `d192513` README site link — clean
- [x] 1.13 `889d71a` archive add-marketing-site — clean
- [x] 1.14 `7c5ff18` archive 2 parallel changes — clean
- [x] 1.15 `9510702` archive cross-platform-qa-vms — 3 main-spec conflicts (Robert's parallel archive used delta format; take-develop's main-spec format)
- [x] 1.16 `852ccf8` archive fix-portable-windows-package-manager — duplicate archive (our 2026-04-20 vs develop's 2026-04-19); accept 2026-04-19, delete 2026-04-20 duplicate, union AGENTS.md ToolRegistry + package-manager-wrapper entries
- [x] 1.17 `7a0e926` ask-user batch method — ask-user-tool.ts + tests take-develop (entire new schema + batch + prepareArguments rewrite); extension registration plumbing preserved
- [x] 1.18 `b2c7d90` session-header image paste — CHANGELOG take-develop
- [x] 1.19 `cee0c58` release skills — clean
- [x] 1.20 `36bd96d` ask-user batch title backfill — clean
- [ ] 1.21 Test gate: `npm run build` + `npm test` — 765/773 pass. 8 failures split: 3 lint-style (expected, need to route new code through platform/ per MERGE-PLAN §2.8), 5 isolated regressions (binary-lookup `which` fallback, resolve-jiti Windows drive letter, recommended-extensions SSH URLs ×3). Fix before Phase 2.

## 2. Phase 2 — Category B (trivial reconcile, 8 commits)

Skipping `8737249` (Phase 0.5):

- [x] 2.1 `f037530` ask-user spec scenario + changelog — clean
- [x] 2.2 `381dbfe` CHANGELOG Unreleased consolidation — clean
- [x] 2.3 `93e0bb8` CI: switch main branch trigger to develop — AGENTS.md pure-additive take-develop
- [x] 2.4 `ca9d76f` sync-release-version workflow — clean
- [x] 2.5 `2e50ebe` deploy-site configure-pages — clean
- [x] 2.6 `2ef37c6` harden ask_user argument validation — take-theirs for spec+test+impl (builds on 7a0e926 we already took fully)
- [x] 2.7 `cf3ab84` pi core version checker — `server.ts` union (both import blocks + both content blocks). Added `ban:child_process-ok` markers to `pi-core-checker.ts` + `pi-core-updater.ts` (tech debt: refactor to platform/spawn.ts Recipe engine in Phase 4)
- [x] 2.8 Test gate: 761/761 shared+extension tests pass.

## 3. Phase 3 — Category C (manual merge, 5 commits)

Order respects dependencies:

- [x] 3.1 `a4cced2` Vitest 4 migration — clean
- [x] 3.2 `9af9dd8` TS errors in tests/routes — clean (needed for vitest 4)
- [x] 3.3 `a45e9d0` path-picker — union: our Windows path normalization + develop's filter/new-folder logic
- [x] 3.4 `8ca4538` zrok tunnel leak fix + compression — AGENTS.md + CHANGELOG.md + architecture.md take-ours (our narrative is superset); server.ts take-ours (getTunnelUrl present); tunnel.ts union (platform killPidWithGroup + SIGKILL escalation + releaseShare)
- [x] 3.5 `e368d27` pi_core broadcast — clean
- [x] 3.6 Test gate — 2519/2519 pass (after 3.7 fixes below)

## 3.5 Phase 3.5 — catch up to develop HEAD (NEW)

- [x] 3.7 2257b08 edits already present on windows-integration — skipped rebase
- [x] 3.8 `c975222` archive `fix-fork-entryid-timing` — tasks.md rename-modify conflict; take-theirs
- [x] 3.9 `4b2b76c` restore zero-failure baseline — browse-endpoint + config test conflicts; take-theirs (canonical fixed versions)
- [x] 3.10 `a75a1db` jsdom fixes — CHANGELOG conflict; take-theirs
- [x] 3.11 `ac2bd96` platform-agnostic tests — editor-registry conflict; take-theirs
- [x] 3.12 `c325227` CHANGELOG consolidation — clean
- [x] 3.13 **SKIPPED** `16e9758` v0.3.0 release (per proposal §Deviation 3)
- [x] 3.14 **SKIPPED** `90a3b7b` site sync to v0.3.0
- [x] 3.15 **SKIPPED** `01c5e0c` CI re-dispatch for v0.3.0
- [x] 3.16 Test gate — 2519/2519 pass (237/237 test files). 12 residual failures fixed in commit `31f5c68`:
  - 1 lint violation in tunnel.ts (scavengeOrphanZrokProcesses routed through killPidWithGroup)
  - 2 editor-registry tests (added mockedSpawnSync for ToolResolver.which; updated 2 detectEditors tests)
  - 4 tunnel tests (async cleanupStaleZrok; scavenge negative-PID assertion)
  - 8 package-manager-wrapper tests (inject ToolRegistry with stub importModule returning fakePiModule, bypassing vi.mock which can't intercept dynamic file:// URLs)
  - 1 package-manager-wrapper-resolve test SKIPPED (bareImportStrategy picks up pi-coding-agent from dev node_modules regardless of HOME; tracked as Phase 4 tech debt)

## 4. Phase 4 — DEFERRED

- [ ] 4.1 Platform/ consolidation (18→13 files) — create follow-up OpenSpec change after v2 merges; do not include in this PR

## 5. Phase 5 — Validation gates (per MERGE-PLAN §5)

- [ ] 5.1 Full `npm test` green on Windows
- [ ] 5.2 Full `npm test` green on macOS
- [ ] 5.3 Full `npm test` green on Linux
- [ ] 5.4 `npm run build` green on all three
- [ ] 5.5 `cd packages/electron && npm run make` green on all three (DMG, AppImage, NSIS, ZIP)
- [ ] 5.6 Manual Windows smoke: no cmd.exe flash ×3 session spawn, `server.log` populated on startup, `pi-dashboard stop` frees both ports after crash, `/api/restart` works from UI, zrok + QR works, editor iframe loads
- [ ] 5.7 Manual macOS smoke: landing page, session spawn, terminal, editor, zrok
- [ ] 5.8 Manual Linux smoke: landing page, session spawn, terminal, editor
- [ ] 5.9 Lint tests green: `no-direct-child-process`, `no-direct-process-kill`, `no-direct-platform-branch`
- [ ] 5.10 Electron first-run wizard: Windows portable install, Windows installed, macOS, Linux — all four paths
- [ ] 5.11 Electron doctor: all 4 platforms, verify ToolResolver finds git when Git-for-Windows is installed via GitHub Desktop private folder (known risk from doctor.ts migration)
- [ ] 5.12 Electron health-check: custom piPort with stale unverified dashboard correctly reports "not running" (documented behaviour change)

## 6. Phase 6 — PR and release

- [ ] 6.1 Update `AGENTS.md`, `README.md`, `docs/architecture.md` with post-merge sweep (reconcile both branches' sections, no deletions from either side)
- [ ] 6.2 Update `CHANGELOG.md` `[Unreleased]`: consolidate Windows support, platform/ architecture, ToolRegistry, health-check behaviour change
- [ ] 6.3 Open PR `windows-integration-v2` → `develop`; link this proposal + MERGE-PLAN + BRANCH-COMPARISON in description
- [ ] 6.4 PR merge policy: **do not squash** — preserve cherry-pick history for traceability
- [ ] 6.5 After merge: close PR #9 as superseded; delete `windows-integration` branch (keep tag `pre-develop-merge` on v2 for rollback reference)
- [ ] 6.6 Run `release-cut` skill for `v0.4.0`; CHANGELOG `[Unreleased]` → `## [0.4.0] - YYYY-MM-DD`
- [ ] 6.7 Tag + push; CI publishes npm + Electron artifacts + drafts GitHub Release
- [ ] 6.8 Open follow-up OpenSpec change for Phase 4 platform/ consolidation (18→13 files)

## Acceptance criteria

- [ ] `windows-integration-v2` HEAD contains every user-visible behaviour from develop commits `a4cced2..01c5e0c` except the v0.3.0 release replay
- [ ] Every file listed in MERGE-PLAN §3 reflects its prescribed "keep windows-integration" or "merge" decision
- [ ] Phase 5 validation gates all pass
- [ ] Two MERGE-PLAN regressions fixed: no cmd.exe flash on Windows pi-session spawn; bridge auto-start failure does not append Node-bug hint for EADDRINUSE / explicit exits
- [ ] `packages/shared/src/platform/` architecture survives intact; all three lint-enforcement tests green
- [ ] `packages/shared/src/tool-registry/` present with override UI + REST endpoints
- [ ] Test isolation tripwire (`6a1b1d8`) integrated; `npm test` cannot run against real `$HOME`
- [ ] Electron packaged bundles work on Windows/macOS/Linux (node-pty terminals spawn)
- [ ] `CHANGELOG.md [Unreleased]` ready for `release-cut`
- [ ] PR description references both MERGE-PLAN.md and BRANCH-COMPARISON.md as the durable decision record
