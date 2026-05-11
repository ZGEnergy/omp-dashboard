# Proposal — Rebase 18 local commits onto origin/develop

## Why

Local `develop` diverged from `origin/develop` at merge-base `61fe3516` (May 8 2026). We accumulated 18 commits on a coherent **flows-plugin migration + UI-primitive registry** track. Origin/develop accumulated 60 commits across **many parallel tracks** (honcho plugin, rpc keeper, electron bootstrap, session-card redesign, tsx→jiti, openspec archival, etc.).

The work cannot live as a permanent fork. We must:
1. Pull origin's 60 commits into our line of work
2. Replay our 18 commits cleanly on top
3. Push the result as a fast-forward (no force-push — our 18 commits are local-only, never published)

Three options were considered:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `git merge origin/develop` | Preserves both histories | Creates merge commit; SessionCard.tsx conflict still has to be resolved by hand; future bisecting harder | rejected |
| `git rebase origin/develop` (auto) | Linear history; smallest commit count | Same conflicts as interactive; less control mid-resolution | rejected |
| **`git rebase --interactive origin/develop`** | Linear history; pause-and-resume at each conflict; clearer mental model | More keystrokes per conflict | **chosen** |

Conflict pre-analysis was performed (see `design.md`). 2 files require manual semantic merge, 1 file requires structural verification, 4 files have additive-only changes that Git's 3-way merge handles automatically, 4 files have zero overlap.

## What Changes

This is a **procedural change** — no code or spec changes. It captures the agreed rebase plan, conflict resolution rules, and verification gates so the rebase is repeatable and auditable.

### Scope

- **18 local commits** (oldest → newest):
  ```
  2c31067d  feat(plugin-runtime): emit manifest predicates + harden sync-versions
  e3d89324  docs(openspec): renumber layers and split client-utils into two packages
  8a271b60  feat(client-utils): extract shared client utilities into a workspace package
  122d503b  docs(openspec): add add-plugin-ui-primitive-registry, supersede ...
  76f1ba9d  feat(plugin-runtime): add UI primitive registry — contracts + runtime + tests
  1d02fbf4  feat(plugin-runtime): wire dashboard registry, migrate flows-plugin, lint
  f706218f  feat(plugin-runtime): useSessionEvents hook + content-view route field
  8e0980d0  feat(flows-plugin): plugin-internal session-state and UI-state hooks
  6e966e78  feat(flows-plugin): slot-claim wrappers for 7 components + 4 command routes
  f75b3ea9  feat(flows-plugin): populate manifest + delete all flow code from shell
  97ea8a87  test(shared): add no-flow-references-in-shell repo-lint
  2d248280  revert(plugin-runtime): walk back content-view route field, use predicate
  6537c876  feat(flows-plugin): predicate-based content-view activation
  47e3b12d  openspec(archive): pluginize-flows-via-registry + add-plugin-ui-primitive-registry
  c7c47234  openspec(delete): three superseded flow-migration changes
  1f6a78e2  fix(extension): retry banner stuck on usage-limit errors
  fa12f4e3  openspec: propose fix-zed-editor-detection
  b0566863  openspec: propose surface-mid-turn-prompt-queue
  ```

- **60 origin commits** ahead of our merge-base, spanning:
  - flows on extension-ui (`47b8865c`, `pi-flows-adopt-extension-ui` proposal)
  - plugin activation UI (`1a4eeeb7`)
  - honcho plugin track (7 commits)
  - rpc keeper sidecar (`e2cd03b3`, `12fd716b`)
  - electron / bootstrap (`ab711621`, `85334083`, etc.)
  - openspec archival (~20 commits)
  - tsx → jiti completion (`c4604878`, `0e895700`)
  - session-card UI redesign (`4b09825b`, `1ace4bc5`)
  - various fixes (lockfile, vitest, etc.)

### Decisions captured in this proposal

| # | Decision | Justification |
|---|----------|---------------|
| 1 | Use `git rebase -i` (not merge, not squash) | Linear history + per-commit control + preserves bisecting |
| 2 | Preserve all 18 commits as-is (no squash) | They are coherent logical units; squashing would lose traceability |
| 3 | Plain `git push` after rebase (no `--force-with-lease`) | Our 18 commits were never published; rebase makes local `develop` a fast-forward of `origin/develop` |
| 4 | Create backup branch `develop-prerebase-<ts>` first | Recoverable failed attempt |
| 5 | Resolve `SessionCard.tsx` by keeping origin's SessionSubcard wrapper structure and deleting only the FLOWS subcard | Origin's structural redesign is more recent and intentional; our deletion of flow content is also intentional; both can coexist |
| 6 | Resolve `AgentCardShell.tsx` by choosing "ours" (re-export shim) and re-applying origin's CSS edit to `packages/client-utils/src/AgentCardShell.tsx` | The file moved during 8a271b60; the CSS change still applies, just to the new location |
| 7 | Defer the architectural decision (`pluginize-flows-via-registry` vs `pi-flows-adopt-extension-ui`) to a separate proposal post-rebase | The rebase is a mechanical operation; the architectural reconciliation is a separate concern |

### Out of scope

- Resolving the architectural fork between LOCAL (`pluginize-flows-via-registry`) and REMOTE (`pi-flows-adopt-extension-ui`). Both can coexist as parallel mechanisms; the call about which is canonical is deferred.
- Fixing the 3 capability specs (`session-listing`, `flow-server-state`, `flow-card-status`) that still reference deleted flow fields. This is a follow-up change (`retire-shell-flow-capability-specs`).
- Completing the J.1-J.6 documentation housekeeping items from the archived `pluginize-flows-via-registry`. Follow-up commit.

## Capabilities

This change introduces no new capability and modifies no existing capability. It is a procedural runbook for a one-shot operation.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `SessionCard.tsx` merge breaks the new subcard UI | MEDIUM | HIGH | Manual semantic merge, post-merge visual inspection in `npm run dev` |
| `AgentCardShell.tsx` re-export + CSS sync gets wrong file | LOW | MEDIUM | Apply CSS to `packages/client-utils/src/AgentCardShell.tsx`, verify with build |
| Slot-consumers.tsx loses origin's new slots during 3-way merge | LOW | MEDIUM | Post-merge diff vs `origin/develop:packages/dashboard-plugin-runtime/src/slot-consumers.tsx` |
| Type-check fails after rebase (orphaned imports, etc.) | MEDIUM | LOW | `npm run reload:check` gate before declaring done |
| Test suite regressions (5195 tests pre-rebase) | LOW | MEDIUM | `npm test` gate; investigate any new failures |
| Origin moves further between rebase and push | LOW | LOW | If push refused, `git fetch && git rebase` again |

## Success criteria

The rebase is considered successful when ALL hold:
1. `git status` shows clean working tree
2. `git log origin/develop..HEAD` shows exactly 18 commits (or fewer if any became empty)
3. `git rev-list --count origin/develop..HEAD` equals 18 (or matches post-fixup count)
4. `npm run reload:check` returns 0 type errors in files we touched
5. `npm test` passes with at least the pre-rebase test count (5195 minimum)
6. `openspec validate --all --strict` shows no new failures in our archived specs (`dashboard-plugin-loader`, `dashboard-shell-slots`, `plugin-ui-primitive-registry`)
7. `npm run build` produces a clean production build
8. `git push origin develop` is accepted as a fast-forward without `--force` flag
