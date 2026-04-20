# Design — Pre-Merge Cleanup

## Context

```
 merge-base 94f07df (Apr 14)
           │
           ├── +38 commits ──→ this branch (PR #9, "windows-integration")
           │                    HEAD = e3a4d53
           │
           └── +44 commits ──→ origin/develop (v0.3.0)
                                HEAD = 01c5e0c
```

A direct `git merge origin/develop` today produces:

- 11 content conflicts (AGENTS.md, bridge-extension spec, PathPicker.tsx, server.ts, tunnel.ts, headless-pid-registry.ts, openspec-poller.ts, config.test.ts, browse-endpoint.test.ts, editor-registry.test.ts, fork-entryid tasks.md)
- 4 rename/rename conflicts (fix-portable-windows-package-manager × 4 files — different archive dates on both sides, plus develop promoted the spec)
- Latent session-killing hazard: `npm test` reads the real `~/.pi/dashboard/headless-pids.json` and can SIGTERM live pi sessions on boot via `cleanupOrphans()`.

This design enumerates the five cleanups that collapse the conflict surface and eliminate the hazard.

## Section 1 — Test-environment isolation (defense in depth)

`origin/develop`'s `6a1b1d8` provides three independent layers. All three should land together because each covers a different failure mode.

```mermaid
flowchart LR
    A[npm test invocation] --> B{Layer 1: HOME override}
    B -->|HOME=$(mktemp -d)| C[vitest process tree]
    C --> D{Layer 2: globalSetup tripwire}
    D -->|HOME === realHome| E[throw — abort run]
    D -->|HOME is tmp| F[pre-create .pi/ dirs]
    F --> G[test files load]
    G --> H{Layer 3: production guards}
    H -->|VITEST && HOME===real| I[no-op with console.warn]
    H -->|safe HOME| J[real cleanupOrphans / killAll]
```

### Why all three layers

- **Layer 1 alone** fails when a developer runs `npx vitest run` directly, bypassing the `npm test` wrapper.
- **Layers 1+2 alone** fail if a test file triggers destructive code at module-import time — globalSetup runs before test files load, but `test-env-guard.ts` is the final belt-and-braces for any code path we haven't mapped.
- **Layer 3 alone** is a correctness guard even if isolation is perfect — callers that accidentally use it in production have a bounded blast radius (warning, no kill).

### Files to copy (verbatim from origin/develop)

1. `packages/server/src/test-env-guard.ts` — 26 lines, zero dependencies on PR-specific platform/ work.
2. `packages/shared/src/test-support/setup-home.ts` — 74 lines, uses only `node:fs` and `node:os`.
3. `packages/server/src/test-support/test-server.ts` — 63 lines, wraps `createServer` with port 0 + safe defaults.
4. `packages/server/src/__tests__/test-server-canary.test.ts` — 31 lines, regression lock.

### Files to modify

- `packages/server/src/headless-pid-registry.ts` — add 2 guard points (cleanupOrphans + killAll). Compatible with PR branch's existing `killPidWithGroup` path.
- `packages/server/src/editor-pid-registry.ts` — add 1 guard point (cleanupOrphans).
- `packages/server/src/server.ts` — add `httpPort()` / `piPort()` getters.
- `packages/server/src/pi-gateway.ts` — add `address()` method.
- Root `package.json` — `test` script prefix.
- Every `packages/{client,extension,server,shared}/vitest.config.ts` — globalSetup path.

### Conflict risk

Near zero. All adds + guarded inserts. The one content conflict will be in `headless-pid-registry.ts` where both branches edited — but the PR-side edits are to `killPidWithGroup` integration, not to the kill-body, so a simple 3-line insertion of the guard resolves it.

## Section 2 — Archive parity with origin/develop

Both branches picked different archive dates for the same four completed proposals. Git sees this as four rename/rename conflicts. Renaming this branch's files to match origin/develop's naming **before** merge makes the renames identical and git auto-resolves.

| Proposal | This branch (now) | origin/develop | Action |
|---|---|---|---|
| cross-platform-qa-vms | `openspec/changes/cross-platform-qa-vms/` | `archive/2026-04-20-…` | `git mv` to match |
| dashboard-ux-fixes-batch | `openspec/changes/dashboard-ux-fixes-batch/` | `archive/2026-04-20-…` | `git mv` |
| explore-dialog-image-paste-remove-terminal-button | `openspec/changes/explore-…/` | `archive/2026-04-19-…` | `git mv` |
| fix-fork-entryid-timing | `openspec/changes/fix-fork-entryid-timing/` (also half-archived) | `archive/2026-04-20-…` | `git mv` + merge `tasks.md` |
| fix-portable-windows-package-manager | `archive/2026-04-19-fix-portable-…/` | `archive/2026-04-20-fix-portable-…/` **plus** promoted to `specs/package-management/` | `git mv` date + accept develop's spec promotion |

### Content-drift check

Archived proposals are meant to be immutable after archival. Diff each pair and accept the later-edited version. In practice, `openspec archive` sometimes adds a "Status: Archived" header — accept that.

## Section 3 — `prep-for-develop-merge` reconciliation

The proposal lists 101 tasks, all unchecked, but the code reflects completed work for Phases 0-3:

- Phase 0 (preload-fastify removal) — verified: `packages/server/preload-fastify.cjs` does not exist.
- Phase 1 (engines.node ≥ 22.18) — verified in root `package.json`.
- Phase 2 (spawnDetached regressions) — verified: `spawn.ts` has `detach?: boolean` and `process-manager.ts:431` passes `detach: false`.
- Phase 3 (platform/ to 5 files) — verified: `packages/shared/src/platform/` contains `spawn.ts`, `process.ts`, `tools.ts`, `paths.ts`, `system.ts` + shim re-exports for git/npm/openspec.

Phase 6 is "Merge origin/develop" but was written against develop@`a4cced2`. 10 commits have landed since. The extension must enumerate and classify each:

| Develop commit | Verdict | Notes |
|---|---|---|
| `3cad40b` | **Pick** | Electron node-pty permissions in bundles |
| `c975222` | **Already matched** | fix-fork-entryid-timing archive (Section 2 of this proposal handles it) |
| `6a1b1d8` | **Pick** | Section 1 of this proposal |
| `4b2b76c` | **Pick** | Restores test baseline |
| `a75a1db` | **Pick** | Eliminates jsdom vitest unhandled errors |
| `c325227` / `381dbfe` | **Pick** | Changelog consolidation (low risk) |
| `ac2bd96` | **Pick** | CI-only test fixes |
| `16e9758` | **Pick** | v0.3.0 release bump — minor reconcile on every `package.json` |
| `90a3b7b` | **Pick** | `site/public/latest-release.json` sync |
| `01c5e0c` | **Pick** | CI re-dispatch on deploy-site |

## Section 4 — AGENTS.md drift

Rooted in the pre-packages/ layout. Mechanical search-and-replace:

```
s|src/client/|packages/client/src/|g
s|src/server/|packages/server/src/|g
s|src/shared/|packages/shared/src/|g
s|src/extension/|packages/extension/src/|g
```

Plus: delete the `preload-fastify.cjs` row (file no longer exists). Run the validator loop from task 4.4 to catch any stragglers.

## Section 5 — Not in scope

- The actual `git merge origin/develop`. That belongs to `prep-for-develop-merge` Phase 6 post-reconciliation.
- Content-drift resolution inside the 12 proposals active on both branches. That's per-file work at merge time, not preparable.
- Vitest 4 migration (`a4cced2`). Already covered by `prep-for-develop-merge` Phase 6.

## Rollback

Each section is independent and reversible with `git reset --mixed` since nothing pushes to origin until the final merge.
