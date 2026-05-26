## Why

PR #9 (`windows-integration`) ships three things develop needs:

1. **Windows correctness** — develop is broken on Windows in 4 independent places (`cli.ts` uses `process.env.HOME` which is undefined on Windows; `resolve-jiti.ts` returns a raw path that Node rejects as `ERR_UNSUPPORTED_ESM_URL_SCHEME`; `/api/restart` shells out to `sh -c` + `lsof` + `curl`; `cmdStop` uses `lsof` only).
2. **`packages/shared/src/platform/` strategy-router architecture** — a real OS-abstraction layer with lint tests (`no-direct-child-process`, `no-direct-process-kill`, `no-direct-platform-branch`) that forbid OS-branching outside the module. This is the standard pattern for serious cross-platform Node projects (esbuild, Prisma, pnpm) and the only reason future Windows regressions get caught automatically.
3. **ToolRegistry** — single-source binary resolution with override UI, REST endpoints, and diagnostic trail. Replaces develop's ad-hoc `where`/`which` + inline spawn calls.

The PR is **stale by 10 develop commits** since its own `MERGE-PLAN.md` was written (PR baseline: `a4cced2`; develop HEAD: `01c5e0c`). Three of those 10 are material — two are **safety-critical** — and the PR's merge-plan does not know about them. Simply cherry-picking per the PR's plan is not sufficient.

The PR also carries **two localized regressions inside `platform/detached-spawn.ts`** that must be fixed on windows-integration before any develop commits land on top (commit `5ab7956` reverted the `d331850` no-flash fix by hard-coding `detached:true`; the `useWindowsRedirect` heuristic doesn't check its real precondition that all stdio must be ignore).

## What Changes

Create `windows-integration-v2` off today's `windows-integration`. Execute the PR's own MERGE-PLAN with three documented deviations and catch up to today's develop HEAD. Cut `v0.4.0` at the end. PR #9 stays open as a historical record until superseded.

### Deviations from PR #9's MERGE-PLAN

1. **Phase 0.5 injected before Phase 1** — pull develop's three safety commits first:
   - `6a1b1d8` test isolation tripwire (`globalSetup` throwing when `HOME === os.userInfo().homedir`, plus `packages/server/src/test-env-guard.ts` gating `headlessPidRegistry.cleanupOrphans/killAll` and `editorPidRegistry.cleanupOrphans`). **Must land before any `npm test` runs** because windows-integration widens the kill surface via `platform/process.ts` — running tests without the tripwire can SIGTERM the live pi session.
   - `3cad40b` electron node-pty spawn-helper execute permission in packaged bundles (different failure mode than `8737249`; without this, DMG/AppImage/NSIS ship with broken terminals).
   - `8737249` node-pty hoist-aware permissions + handler error surfacing — already in MERGE-PLAN Category B #27, but ordered before Phase 1 so terminals work for every test gate.

2. **Phase 3.5 added** — catch up to today's develop HEAD (`01c5e0c`) after Category C:
   - `c975222` archive `fix-fork-entryid-timing` — **expected conflict** because windows-integration has this change active with edits to proposal/design/tasks/spec. Resolution: apply windows-integration's refinements to the archived content, then archive.
   - `4b2b76c`, `a75a1db`, `ac2bd96` — test baseline + jsdom fixes + platform-agnostic test fixtures.
   - `c325227` — CHANGELOG Unreleased consolidation (merge, don't replace).
   - **Skip** `16e9758` (v0.3.0 release commit), `90a3b7b` (site sync), `01c5e0c` (CI re-dispatch). Cut v0.4.0 fresh at the end instead of replaying v0.3.0 on the merged tree.

3. **Phase 4 platform/ consolidation deferred** — the 18→13 file merge (`BRANCH-COMPARISON.md` §9.5) is pure moves with zero behaviour change. It ships as a follow-up PR for review isolation, not in this merge.

### Out of scope

- Node version preflight beyond what the MERGE-PLAN §0.1b already specifies (`node-guard.ts` + `engines.node >= 22.18.0`). The preload-fastify-cjs workaround stays rejected per `BRANCH-COMPARISON.md` §10.
- The optional `platform/` consolidation (Phase 4). Follow-up PR.
- Any new features beyond what the 34 + 10 develop commits introduce.

## Impact

### Specs affected (delta)

- `packages/shared/src/platform/` — new capability, full spec per `openspec/changes/consolidate-platform-handlers/specs/platform-primitives/spec.md` (already drafted on windows-integration).
- `tool-registry` — new capability, spec already drafted on windows-integration under `openspec/changes/archive/2026-04-19-consolidate-tool-resolution/`.
- `platform-paths` — new capability, spec already drafted under `openspec/changes/platform-path-normalization/`.
- `dashboard-server`, `bridge-extension`, `command-executor`, `force-kill-handler`, `editor-detection` — amended specs on windows-integration (already drafted).
- `ask-user-tool`, `ask-user-tool/batch-method` — amended on develop during the 10-commit gap; reconcile on merge.

### Code surface

- **High blast radius**: `packages/shared/src/platform/*` (18 new files), `packages/shared/src/tool-registry/*` (6 new files), `packages/shared/src/resolve-jiti.ts` return-type change, `packages/server/src/cli.ts` rewrite, `packages/extension/src/server-launcher.ts` rewrite, `packages/server/src/process-manager.ts` spawn strategy replacement.
- **Electron surface**: `packages/electron/src/lib/{app-menu,bundled-node,dependency-detector,dependency-installer,doctor,health-check,server-lifecycle}.ts` all migrate to ToolResolver + `isDashboardRunning`. Windows portable install path and Linux/macOS bundled node-pty permissions are the two highest-risk areas.
- **Test infra**: Vitest 4 migration (root `vitest.config.ts` replaces `vitest.workspace.ts`). Every workspace's vitest config changes. Test-isolation tripwire from `6a1b1d8` becomes mandatory.

### Migration, compatibility, rollback

- **Migration**: none required for end-users. `engines.node` bumps to `>=22.18.0`; users on older Node see a clear preflight error from `node-guard.ts` with upgrade instructions.
- **Compatibility**: `health-check.ts` moves from `curl`-based probe to identity-verified `isDashboardRunning()`. Users with a stale/unverified old dashboard on a custom port will see "not running" after upgrade — correct behaviour, but document in CHANGELOG.
- **Rollback**: Phase 0 ends with `git tag pre-develop-merge` on `windows-integration-v2`. Any phase can roll back to this tag. If the merge ships and regresses, `v0.3.0` remains available on npm + GitHub Releases. `npm deprecate` rather than `npm unpublish` per `release-revoke` skill.

### Validation gates (non-negotiable)

Per MERGE-PLAN §5, before PR to develop:

- Full `npm test` green on Windows, macOS, Linux (CI matrix).
- `npm run build` green on all three.
- Electron make green on all three (DMG, AppImage, NSIS, ZIP).
- Manual Windows smoke: no cmd.exe flash on ×3 session spawn, `server.log` populated, `pi-dashboard stop` frees ports after crash, `/api/restart` works, zrok + QR works, editor iframe loads.
- Manual macOS + Linux smoke: landing page, session spawn, terminal, editor.
- All three lint-style tests green: `no-direct-child-process`, `no-direct-process-kill`, `no-direct-platform-branch`.
