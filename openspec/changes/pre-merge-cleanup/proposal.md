# Pre-Merge Cleanup: Prepare `develop` (PR #9) for merge with `origin/develop`

## Why

The `develop` branch in this fork (PR #9, aka `windows-integration`) has diverged from `origin/develop` by 38 commits while `origin/develop` has moved forward 44 commits. A direct merge attempt produces **11 content conflicts, 4 rename/rename conflicts, and carries a latent session-killing hazard** because `origin/develop`'s test-environment isolation work (`6a1b1d8`) is missing here.

Before the merge can proceed safely, five independent cleanups need to land on this branch so the resulting merge is (a) non-destructive to live pi sessions, (b) structurally conflict-free on already-archived proposals, and (c) tracked truthfully against the plan-of-record.

## What Changes

### 1. Backport test-environment isolation from `origin/develop` `6a1b1d8`

- **ADD** `packages/server/src/test-env-guard.ts` — `isUnsafeTestHomeScan()` predicate.
- **ADD** `packages/shared/src/test-support/setup-home.ts` — vitest `globalSetup` tripwire + directory bootstrap.
- **ADD** `packages/server/src/test-support/test-server.ts` — `createTestServer()` helper (port 0, safe defaults).
- **ADD** `packages/server/src/__tests__/test-server-canary.test.ts` — locks in the port-0 contract.
- **MODIFY** `packages/server/src/headless-pid-registry.ts` — guard `cleanupOrphans()` and `killAll()` with `isUnsafeTestHomeScan()`.
- **MODIFY** `packages/server/src/editor-pid-registry.ts` — guard `cleanupOrphans()`.
- **MODIFY** `package.json` root `test` / `test:watch` scripts — prepend `HOME=$(mktemp -d -t pi-test-XXXXXX)`.
- **MODIFY** every `packages/*/vitest.config.ts` — wire `globalSetup: ["../shared/src/test-support/setup-home.ts"]`.
- **MODIFY** migrated integration tests (`smoke-integration`, `health-endpoint`, `session-file-dedup`) to use `createTestServer()`.

### 2. Archive 4 proposals that `origin/develop` already archived

Rename each active directory to its matching archive path so `git merge` sees identical rename targets on both sides (eliminates rename/rename conflicts):

- `openspec/changes/cross-platform-qa-vms/` → `openspec/changes/archive/2026-04-20-cross-platform-qa-vms/`
- `openspec/changes/dashboard-ux-fixes-batch/` → `openspec/changes/archive/2026-04-20-dashboard-ux-fixes-batch/`
- `openspec/changes/explore-dialog-image-paste-remove-terminal-button/` → `openspec/changes/archive/2026-04-19-explore-dialog-image-paste-remove-terminal-button/`
- `openspec/changes/fix-fork-entryid-timing/` → `openspec/changes/archive/2026-04-20-fix-fork-entryid-timing/`

Also reconcile the pre-existing double-rename of `fix-portable-windows-package-manager`: develop archived it under `2026-04-20-*` and promoted the spec into `openspec/specs/package-management/`. On this branch it's archived under `2026-04-19-*`. Rename to match develop's date and keep the promoted spec location.

### 3. Sync `prep-for-develop-merge/tasks.md` with reality

The proposal has 101 unchecked tasks but Phases 0–3 are already implemented in code (platform/ consolidated to 5 files, preload-fastify removed, `detach: false` restored, paths module added). Two options:

- **Option A (preferred):** Mark Phases 0–3 as done, extend Phase 6 to cover the 10 post-`a4cced2` develop commits (notably `3cad40b`, `6a1b1d8`, `a75a1db`, `4b2b76c`, `16e9758`, `90a3b7b`, `01c5e0c`), and carry through.
- **Option B:** Archive `prep-for-develop-merge` as completed-by-code and let this `pre-merge-cleanup` proposal own the remaining merge-execution work.

This proposal takes Option A — the document is a useful record, no reason to lose it.

### 4. Remove stale AGENTS.md entries

- Drop the `packages/server/preload-fastify.cjs` row (file no longer exists).
- Update ~50 key-files rows that still reference pre-migration `src/client/`, `src/server/`, `src/shared/`, `src/extension/` paths to their current `packages/{client,server,shared,extension}/src/` locations.
- Verify every path in the key-files table resolves on disk.

### 5. Delete two accidentally-committed one-shot merge-planning docs

Already done in commit `e3a4d53` — `MERGE-PLAN.md` and `BRANCH-COMPARISON.md` removed. Listed here for audit completeness; no further action needed.

## Impact

- **Affected specs:** `test-environment-isolation` (NEW — adopted from origin/develop), `bridge-extension` (minor — doc sync).
- **Affected code:** 11 files added, ~6 modified for (1); 5 rename operations for (2); 1 doc edit for (3) and (4).
- **Blast radius:** Additive. No existing production code path changes behaviour outside test runs.
- **Risk:** Low. Every change is either a pure rename, a new file, or a guard that only fires when `VITEST=true`.
- **Unblocks:** Clean merge of `origin/develop` into this branch (content conflicts drop from 11→~6, rename/rename conflicts drop from 4→0, session-kill hazard eliminated).
