## Context

Two authoritative documents already live on the PR branch:

- `MERGE-PLAN.md` — 555 lines, commit-by-commit cherry-pick plan with file-level conflict resolution table (`§3.1`–`§3.14`).
- `BRANCH-COMPARISON.md` — 525 lines, structural divergence audit, regression root-cause analysis, consolidation proposal.

This design document **does not duplicate them**. It captures only:

1. The merge strategy decision (why cherry-pick, not merge, and why `windows-integration-v2` vs. in-place).
2. The three deviations from MERGE-PLAN driven by develop moving 10 commits since the plan was authored.
3. The decision record for skipping develop's `v0.3.0` release commit during merge.
4. The validation gate sequencing.

Read `MERGE-PLAN.md` and `BRANCH-COMPARISON.md` on the PR branch for everything else.

## Branch topology

```
                94f07df (merge-base, ~Apr 14)
                 │
origin/develop ─┤─ +44 commits → 01c5e0c (today)
                │       │
                │       └─ 10 commits past MERGE-PLAN baseline (a4cced2)
                │           of which 3 are material
                │
                └─ +38 commits → de695e1 = origin/windows-integration = PR #9
                                   │
                                   └─ fork to windows-integration-v2
                                           │
                                           ▼
                        Phase 0 → 0.5 → 1 → 2 → 3 → 3.5 → 5 → 6
                                  │
                                  └─ PR: windows-integration-v2 → develop
                                         (PR #9 closed/superseded after merge)
```

## Why cherry-pick, not `git merge origin/develop`

A full merge produces non-auto-mergeable conflicts in 15+ files across the server lifecycle hot path (`cli.ts`, `process-manager.ts`, `server-launcher.ts`, `resolve-jiti.ts`, `electron/server-lifecycle.ts`, `system-routes.ts`, `directory-service.ts`, etc.). Every conflict is a judgement call between:

- windows-integration's strategy-router architecture (correct for cross-platform), or
- develop's inline `process.platform` branching (simpler but broken on Windows).

Cherry-pick lets each develop commit be evaluated, adapted, or skipped in isolation — with the pre-committed file-level resolution table in `MERGE-PLAN.md §3` as the tiebreaker.

## Why `windows-integration-v2` instead of in-place on `windows-integration`

- PR #9 is already reviewable as a historical record; force-pushing destroys review context.
- A fresh branch lets Phase 0 (regression fixes) be isolated from Phase 1+ (feature integration) in git history.
- If `windows-integration-v2` derails, PR #9 still exists and a third attempt costs nothing.
- The maintenance burden of one more branch is negligible; the cost of losing review context on a 17,565-line PR is not.

## The three deviations from MERGE-PLAN

### Deviation 1: Phase 0.5 — pull safety commits before Phase 1

```
     MERGE-PLAN order              v2 order
     ─────────────                ─────────
     Phase 0: regressions          Phase 0: regressions (unchanged)
                                   Phase 0.5: 6a1b1d8 + 3cad40b + 8737249  ← NEW
     Phase 1: Category A (20)      Phase 1: Category A (20, minus 8737249)
     Phase 2: Category B (9)       Phase 2: Category B (8, minus 8737249)
     Phase 3: Category C (5)       Phase 3: Category C (5, unchanged)
                                   Phase 3.5: catch-up to develop HEAD      ← NEW
     Phase 4: consolidation        Phase 4: DEFERRED to follow-up PR
     Phase 5: validation           Phase 5: validation (expanded matrix)
```

**Rationale for `6a1b1d8` first:** windows-integration commit `39acb1e` routes all process termination through `platform/process.ts`. Without the test-isolation tripwire from `6a1b1d8`, running the test suite on the merged branch SIGTERMs the live pi session running the tests. Every test gate between phases is affected. The tripwire must exist before any `npm test` runs on v2.

**Rationale for `3cad40b` first:** Packaged Electron apps (DMG, AppImage, NSIS) ship `spawn-helper` and `pty.node` without the execute bit after Electron-Forge ASAR packing. Commit `8737249` (already in Category B) fixes hoist-aware lookup but not the bundle permission. Without `3cad40b`, every Phase 5 "electron make" validation fails on node-pty terminal spawn.

**Rationale for `8737249` reorder:** pulled from Category B #27 into Phase 0.5 so the hoist-aware lookup is present when `3cad40b`'s runtime chmod runs. Keeps the two node-pty fixes adjacent in git history.

### Deviation 2: Phase 3.5 — catch up to develop HEAD

Develop's last 10 commits (`a4cced2..01c5e0c`) fall into three groups:

| Group | Commits | Action |
|---|---|---|
| Already pulled in Phase 0.5 | `6a1b1d8`, `3cad40b` | skip |
| Non-release polish | `c975222`, `4b2b76c`, `a75a1db`, `ac2bd96`, `c325227` | cherry-pick |
| Release commits | `16e9758`, `90a3b7b`, `01c5e0c` | **skip — see Deviation 3** |

The only non-trivial conflict in this group is `c975222` archiving `fix-fork-entryid-timing`. The PR has this change **active** with edits across `proposal.md`, `design.md`, `tasks.md`, and the spec (commit `2257b08`). Resolution:

1. Before cherry-picking `c975222`, rebase windows-integration's `2257b08` edits onto the pre-archive content of the change (check whether those edits are already reflected in develop's archived version; if so, skip our edits).
2. Cherry-pick `c975222` — the file moves should now apply cleanly.
3. If any windows-integration edits were lost (not yet in archived content), re-apply them as a follow-up commit on the archived spec.

### Deviation 3: skip v0.3.0 replay, cut v0.4.0 fresh

Develop's `16e9758 chore(release): v0.3.0` bumps every workspace `package.json` from `0.2.x` to `0.3.0`. Windows-integration never saw that bump. Replaying it on v2 means:

- Every cherry-pick crossing the version boundary conflicts on version strings.
- Confusing git history where v0.3.0 "exists" on both branches with different tree contents.
- v0.3.0 is already published to npm + GitHub Releases; replaying adds no value.

Decision: skip `16e9758`, `90a3b7b` (site sync for v0.3.0), `01c5e0c` (CI re-dispatch for v0.3.0). At end of Phase 5, run the `release-cut` skill to promote `[Unreleased]` → `v0.4.0`. This work is substantial enough (architecture change, lint-enforced OS abstraction, ToolRegistry, Windows correctness) to warrant a minor bump rather than a patch.

## Regression fixes (Phase 0) — unchanged from MERGE-PLAN §0

Captured here for visibility only. See `MERGE-PLAN.md §0.1a`, `§0.1b`, `§0.2` on the PR branch for exact diffs.

1. **`0.1a` — revert uncommitted preload-fastify-cjs** (pure deletes, ~640 LOC). Decision record in `BRANCH-COMPARISON.md §10`.
2. **`0.1b` — add `packages/server/src/node-guard.ts`** + `engines.node >= 22.18.0`. Preflight refuse-to-start replacing the rejected preload workaround.
3. **`0.2` — fix `detach:false` regression in `platform/detached-spawn.ts`**. Add `detach?: boolean` option to `SpawnDetachedOptions` (default `true`); tighten `useWindowsRedirect` gate with `stdinMode === "ignore"`; `spawnHeadlessDetached` passes `detach: false` to restore commit `d331850`'s no-flash behaviour.

## Validation gate sequencing

```
Phase 0.3  (manual Windows smoke)      ──→  if fail: STOP, fix
Phase 0.5  (npm test after tripwire)   ──→  if fail: STOP
Phase 1    (npm test every 5 picks)    ──→  if fail: revert last batch
Phase 2    (npm test after phase)       ──→  if fail: revert
Phase 3    (npm test after each pick)   ──→  Vitest 4 is the long pole
Phase 3.5  (npm test after catch-up)    ──→
Phase 5    (full CI + manual smoke)     ──→  3-OS + Electron make + lint
Phase 6    (release-cut to v0.4.0)      ──→  only after all gates green
```

No phase advances until its preceding gate is green. The `pre-develop-merge` tag created at end of Phase 0 is the rollback target for any phase.

## What stays the same as MERGE-PLAN

- File-level conflict resolution table (`§3.1`–`§3.14`) — **authoritative**.
- Commit categorization (A clean picks, B trivial reconcile, C manual merge) — **unchanged**.
- Phase 0 regression fixes (0.1a, 0.1b, 0.2) — **unchanged**.
- Validation gate matrix (`§5`) — **expanded** for Phase 0.5 and Phase 3.5, otherwise unchanged.
- Non-goals (`§6`) — **unchanged**. Still no `git merge origin/develop`, still no resurrect preload-fastify, still no platform/ consolidation during merge.

## Risk register (delta from MERGE-PLAN §5)

| Risk | Mitigation |
|---|---|
| Test-isolation tripwire not landed before other tests run | Phase 0.5 is ordered first; if `6a1b1d8` doesn't cherry-pick cleanly (it's test-infra, likely clean), STOP and resolve before any Phase 1 test |
| node-pty bundle permissions interact badly with windows-integration's platform/exec.ts spawn shape | `3cad40b` adds a runtime chmod in `packages/server/src/fix-pty-permissions.ts`; verify the file's expected location hasn't moved under the platform/ reorganization; if it has, adapt the chmod path |
| `c975222` archive-move conflict in Phase 3.5 | Rebase windows-integration's `2257b08` edits first; fall back to re-applying edits post-archive if content diverged |
| v0.3.0 skip creates CHANGELOG gap | Phase 6 v0.4.0 cut explicitly includes "integrated Windows support, platform/ architecture, ToolRegistry" as the flagship bullet; no mention of v0.3.0 because npm/GitHub already know |
| Electron health-check behaviour change (curl → identity-verified) surprises users | CHANGELOG entry in Phase 6 explicitly calls out "`isDashboardRunning()` replaces `curl`-based probe; custom-port users with stale dashboards must restart" |
| Someone commits to develop during the merge | Rebase Phase 3.5 catch-up onto latest develop before Phase 5. Use `git rerere` to remember resolutions from earlier phases |
| Phase 4 consolidation skipped leaves maintenance backlog | Explicitly scheduled as follow-up PR; not a blocker for this one |

## Post-merge follow-ups (deferred, not in this change)

1. **Platform/ consolidation** (`BRANCH-COMPARISON §9.5`) — 18→13 files, pure moves. Own PR.
2. **Node-compat module** — move `node-version-check.ts` + (if ever resurrected) `preload-fastify.ts` to `packages/shared/src/node-compat/`. Only if we decide to ship a Node workaround in the future; currently not needed because `node-guard.ts` replaces it.
3. **Subprocess-adapter / exec.ts reconciliation** — the two files both claim to be "the single spawn boundary." Decide: inline `subprocess-adapter.ts` into `package-manager-wrapper.ts`, or promote it to replace `exec.ts`.
