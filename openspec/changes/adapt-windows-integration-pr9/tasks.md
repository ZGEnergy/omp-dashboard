## 0. Preflight on `windows-integration-v2`

- [ ] 0.1 Create `windows-integration-v2` branch from today's `origin/windows-integration` (`de695e1`)
- [ ] 0.2 Read and internalize `MERGE-PLAN.md` and `BRANCH-COMPARISON.md` from the PR branch
- [ ] 0.3 Execute MERGE-PLAN §0.1a: revert uncommitted preload-fastify-cjs work via `git checkout HEAD --` + `rm -rf`; commit as `chore(server): remove abandoned preload-fastify-cjs workaround`
- [ ] 0.4 Execute MERGE-PLAN §0.1b: add `packages/server/src/node-guard.ts` + `packages/server/src/__tests__/node-guard.test.ts` + `engines.node >=22.18.0` in `packages/server/package.json` + preflight call in `cmdStart` and `runForeground`; commit as `feat(server): refuse to start on Node versions affected by nodejs/node#58515`
- [ ] 0.5 Execute MERGE-PLAN §0.2: add `detach?: boolean` to `SpawnDetachedOptions` in `packages/shared/src/platform/detached-spawn.ts` (default `true`); tighten `useWindowsRedirect` gate with `stdinMode === "ignore"`; pass `detach: false` from `spawnHeadlessDetached` in `packages/server/src/process-manager.ts`; add regression test; commit as `fix(windows): restore d331850 no-flash pi-session spawn`
- [ ] 0.6 Manual Windows validation: fresh start, no flash on ×3 session spawn, `server.log` populated, `/api/restart` works, `pi-dashboard stop` frees port 8888 when PID stale
- [ ] 0.7 If any of 0.6 fails, STOP and fix before proceeding
- [ ] 0.8 Tag `git tag -a pre-develop-merge -m "windows-integration-v2, all regressions fixed"` as rollback anchor

## 0.5 Safety commits (NEW, not in MERGE-PLAN)

- [ ] 0.9 Cherry-pick `8737249` (node-pty hoist-aware permissions + handler error surfacing); resolve any conflicts with platform/ imports; run `npm test`
- [ ] 0.10 Cherry-pick `3cad40b` (node-pty spawn-helper bundle execute permission); verify `packages/server/src/fix-pty-permissions.ts` path still matches platform/ layout; run `npm test`
- [ ] 0.11 Cherry-pick `6a1b1d8` (test isolation tripwire — `packages/shared/src/test-support/setup-home.ts` + `packages/server/src/test-env-guard.ts` + root `vitest.config.ts` hookup); run `npm test` and verify tripwire fires when invoked outside ephemeral HOME
- [ ] 0.12 Verify `HOME=$(mktemp -d -t pi-test-XXXXXX) npx vitest run packages/server` passes and that the tripwire throws without the `HOME=` prefix
- [ ] 0.13 Run `find ~/.pi/agent/sessions -name "*.meta.json" -exec md5 -q {} \; | sort > /tmp/before.txt`; run `npm test`; verify only the current-session directory changed (per AGENTS.md isolation verification recipe)

## 1. Phase 1 — Category A (clean picks, 19 commits)

Cherry-pick in MERGE-PLAN §2 order, SKIPPING `8737249` (already in Phase 0.5):

- [ ] 1.1 `ee838d0` marketing site + GH Pages workflow
- [ ] 1.2 `e95491b` error-banner collapse + Retry + Copy
- [ ] 1.3 `f2ec691` CHANGELOG.md + release process docs
- [ ] 1.4 `97dd4bd` persistent editor PID registry (merge with our editor-manager changes per MERGE-PLAN §3.7)
- [ ] 1.5 `15da6a8` site download section + theme toggle
- [ ] 1.6 `c0bd183` inline SVG brand + barber-pole + pin-folder label
- [ ] 1.7 `4143d49` CORS tunnel-origin allowlist
- [ ] 1.8 `a343efa` docs: CORS allowlist + pre-compressed static
- [ ] 1.9 `144301c` QA verification fixes
- [ ] 1.10 `89d3bf6` landing-page onboarding
- [ ] 1.11 `c004806` OpenSpec card state pill + Tasks popover
- [ ] 1.12 `d192513` README marketing site link (resolve README conflict: merge both sections)
- [ ] 1.13 `889d71a` archive add-marketing-site
- [ ] 1.14 `7c5ff18` archive 2 parallel changes
- [ ] 1.15 `9510702` archive cross-platform-qa-vms (inspect for QA-work overlap)
- [ ] 1.16 `852ccf8` archive fix-portable-windows-package-manager
- [ ] 1.17 `7a0e926` ask-user batch method (merge with our ask-user-tool edits per MERGE-PLAN §3.10)
- [ ] 1.18 `b2c7d90` session-header image paste propagation
- [ ] 1.19 `cee0c58` release-cut + release-revoke skills
- [ ] 1.20 `36bd96d` ask-user batch title backfill (depends on 1.17)
- [ ] 1.21 Run `npm test` + `npm run build`; must be green before Phase 2

## 2. Phase 2 — Category B (trivial reconcile, 8 commits)

Skipping `8737249` (Phase 0.5):

- [ ] 2.1 `f037530` ask-user spec scenario + changelog (merge with our spec edits)
- [ ] 2.2 `381dbfe` CHANGELOG Unreleased consolidation
- [ ] 2.3 `93e0bb8` CI: switch main branch trigger to develop (merge publish.yml)
- [ ] 2.4 `ca9d76f` CI: sync-release-version pushes to develop
- [ ] 2.5 `2e50ebe` CI: deploy-site configure-pages enablement
- [ ] 2.6 `2ef37c6` harden ask_user argument validation (depends on 1.17)
- [ ] 2.7 `cf3ab84` pi core version checker (may conflict with our routes index)
- [ ] 2.8 Run `npm test` + `npm run build`; must be green before Phase 3

## 3. Phase 3 — Category C (manual merge, 5 commits)

Order respects dependencies:

- [ ] 3.1 `a4cced2` Vitest 4 migration — **foundational**, do first. Expect conflict on root config, deletion of workspace file. Verify `packages/shared/vitest.config.ts` + test-support `globalSetup` still wire correctly
- [ ] 3.2 `9af9dd8` TS errors in tests/routes — inspect per MERGE-PLAN §2 Category C #30; likely SKIP if errors are develop-specific (caused by develop's ad-hoc spawn code not present on v2)
- [ ] 3.3 `a45e9d0` path-picker server-side filter + new-folder — reconcile `browse.ts` per MERGE-PLAN §3.8: normalize path first (our code), then apply filter/listing logic
- [ ] 3.4 `8ca4538` zrok tunnel leak fix + compression — reconcile `tunnel.ts` per MERGE-PLAN §3.11: keep ToolResolver binary lookup, apply develop's lifecycle + compression fixes
- [ ] 3.5 `e368d27` pi_core broadcast (depends on 2.7)
- [ ] 3.6 Run `npm test` + `npm run build`; must be green before Phase 3.5

## 3.5 Phase 3.5 — catch up to develop HEAD (NEW)

- [ ] 3.7 Rebase windows-integration's `2257b08` (`fix-fork-entryid-timing` edits) onto pre-archive content; if already in develop's archived version, skip our edits
- [ ] 3.8 Cherry-pick `c975222` archive `fix-fork-entryid-timing`; resolve file-move conflicts
- [ ] 3.9 Cherry-pick `4b2b76c` restore zero-failure baseline
- [ ] 3.10 Cherry-pick `a75a1db` eliminate vitest unhandled errors from jsdom gaps
- [ ] 3.11 Cherry-pick `ac2bd96` platform-agnostic test fixtures
- [ ] 3.12 Cherry-pick `c325227` CHANGELOG Unreleased consolidation (merge, don't replace)
- [ ] 3.13 **SKIP** `16e9758` v0.3.0 release (deviation 3 — v0.4.0 cut at end)
- [ ] 3.14 **SKIP** `90a3b7b` site sync to v0.3.0
- [ ] 3.15 **SKIP** `01c5e0c` CI re-dispatch for v0.3.0 release
- [ ] 3.16 Run `npm test` + `npm run build`; must be green

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
