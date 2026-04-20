# Tasks

## 1. Backport test-environment isolation (`6a1b1d8`)

- [ ] 1.1 Cherry-pick or hand-port `packages/server/src/test-env-guard.ts` from `origin/develop`
- [ ] 1.2 Cherry-pick `packages/shared/src/test-support/setup-home.ts` from `origin/develop`
- [ ] 1.3 Cherry-pick `packages/server/src/test-support/test-server.ts` from `origin/develop`
- [ ] 1.4 Cherry-pick `packages/server/src/__tests__/test-server-canary.test.ts` from `origin/develop`
- [ ] 1.5 Add `isUnsafeTestHomeScan()` guards to `packages/server/src/headless-pid-registry.ts` (`cleanupOrphans`, `killAll`)
- [ ] 1.6 Add `isUnsafeTestHomeScan()` guard to `packages/server/src/editor-pid-registry.ts` (`cleanupOrphans`)
- [ ] 1.7 Update root `package.json` `test` / `test:watch` scripts to prepend `HOME=$(mktemp -d -t pi-test-XXXXXX)`
- [ ] 1.8 Wire `globalSetup` in every `packages/*/vitest.config.ts`
- [ ] 1.9 Migrate `smoke-integration.test.ts`, `health-endpoint.test.ts`, `session-file-dedup.test.ts` to `createTestServer()`
- [ ] 1.10 Add `DashboardServer.httpPort()` / `piPort()` getters + `PiGateway.address()` (required by `createTestServer`)
- [ ] 1.11 Copy `openspec/specs/test-environment-isolation/spec.md` from `origin/develop`
- [ ] 1.12 Run `npm test` with the new isolation — verify zero mutations to real `~/.pi/agent/sessions/` and real dashboard `headless-pids.json`

## 2. Archive superseded proposals

- [ ] 2.1 `git mv openspec/changes/cross-platform-qa-vms openspec/changes/archive/2026-04-20-cross-platform-qa-vms`
- [ ] 2.2 `git mv openspec/changes/dashboard-ux-fixes-batch openspec/changes/archive/2026-04-20-dashboard-ux-fixes-batch`
- [ ] 2.3 `git mv openspec/changes/explore-dialog-image-paste-remove-terminal-button openspec/changes/archive/2026-04-19-explore-dialog-image-paste-remove-terminal-button`
- [ ] 2.4 `git mv openspec/changes/archive/2026-04-20-fix-fork-entryid-timing` — already archived on this branch under same date; verify parity with origin/develop and resolve tasks.md content conflict
- [ ] 2.5 Resolve `fix-portable-windows-package-manager` double-archive: rename local `archive/2026-04-19-fix-portable-windows-package-manager` → `archive/2026-04-20-fix-portable-windows-package-manager` and cherry-pick develop's promotion of its spec into `openspec/specs/package-management/`
- [ ] 2.6 Spot-check each archived proposal has matching `proposal.md`/`tasks.md`/`design.md` content vs origin/develop (diff, not equivalence)

## 3. Reconcile `prep-for-develop-merge`

- [ ] 3.1 Edit `openspec/changes/prep-for-develop-merge/tasks.md` — mark Phase 0 (preload cleanup), Phase 1 (engines.node), Phase 2 (spawnDetached regressions), Phase 3 (platform/ consolidation to 5 files) as `[x]` done
- [ ] 3.2 Extend Phase 6 with a cherry-pick sub-table covering the 10 develop commits added after `a4cced2`: `3cad40b`, `c975222`, `6a1b1d8`, `4b2b76c`, `a75a1db`, `c325227`, `ac2bd96`, `16e9758`, `90a3b7b`, `01c5e0c`
- [ ] 3.3 Mark each of those 10 cherry-picks as a task line; note that `6a1b1d8` is already satisfied by Section 1 of this proposal
- [ ] 3.4 Update `prep-for-develop-merge/proposal.md` "Why" section to note the 10-commit slippage if still relevant

## 4. Sweep `AGENTS.md`

- [ ] 4.1 Delete the `packages/server/preload-fastify.cjs` table row
- [ ] 4.2 Bulk-rewrite `src/client/` → `packages/client/src/` in the Key Files table
- [ ] 4.3 Bulk-rewrite `src/server/` → `packages/server/src/`, `src/shared/` → `packages/shared/src/`, `src/extension/` → `packages/extension/src/`
- [ ] 4.4 Run a validation loop: for every backticked path in AGENTS.md, verify `-e` on disk; list and fix any remaining misses
- [ ] 4.5 Mirror the same path corrections in `docs/architecture.md` where they reference code files

## 5. Audit trail

- [ ] 5.1 Confirm commit `e3a4d53` (removal of MERGE-PLAN.md + BRANCH-COMPARISON.md) is on the branch
- [ ] 5.2 Add a note in `prep-for-develop-merge/proposal.md` pointing to this cleanup proposal as a prerequisite

## 6. Verification before merge

- [ ] 6.1 `git merge --no-commit --no-ff origin/develop` dry-run — expect ≤6 content conflicts, 0 rename/rename conflicts
- [ ] 6.2 Abort dry-run (`git merge --abort`) and record the conflict list in `design.md`
- [ ] 6.3 Only then proceed to real merge (tracked in `prep-for-develop-merge` Phase 6)
