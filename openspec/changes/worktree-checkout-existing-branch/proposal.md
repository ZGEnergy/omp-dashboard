# Worktree spawn dialog: check out existing branch

## Why

Today `WorktreeSpawnDialog` has exactly one branch-mode workflow: **fork to new branch**. The user must always type a new branch name; the picker only chooses a *base* to fork from. This is wrong for the common case where the user has a pre-existing branch (local or remote-only) sitting unused and wants to resume work on it in an isolated worktree.

`git` already supports this: `git worktree add <path> <existing-branch>` checks out the branch directly (DWIM-creates a tracking branch from `origin/<x>` when only remote exists). The dashboard refuses it.

## Dependency

This change **layers on top of `add-worktree-from-pull-request`**, which introduces a binary source toggle on `WorktreeSpawnDialog` ("From a branch" vs "From a pull request"). This proposal **widens that toggle from binary to ternary** by splitting "From a branch" into two distinct modes:

```
Before (post-add-worktree-from-pull-request):     After (this change):
  ( ) From a branch                                 ( ) Fork to new branch
  ( ) From a pull request                           ( ) Check out existing branch
                                                    ( ) From a pull request
```

Implementation order: `add-worktree-from-pull-request` lands first. The tasks here assume the binary toggle and its mode-switching effect already exist; this change extends the radio set and renames the first option.

**Fallback** if `add-worktree-from-pull-request` is still blocked on its §0 spike: this proposal can land standalone by introducing a binary toggle ("Fork to new branch" vs "Check out existing branch"); the PR change later widens to ternary. The fallback path is marked in `tasks.md` but not the preferred sequence.

## What changes

### Dialog (extends the toggle from PR change)

- **Rename** the existing **"From a branch"** mode to **"Fork to new branch"**. The fields and submit path are unchanged — this is purely a label change to make space for the sibling mode.
- **Add a new mode "Check out existing branch"**. Picker selects a branch ref; no new-branch input is rendered; submit calls `createWorktree({cwd, base, path?})` with `newBranch` omitted.
- **Refine the default-mode logic** introduced by the PR change. The PR change defaults to "From a branch" unconditionally; this change refines:
  - `attachProposal` set (proposal-driven `⑂+` button) → **Fork to new branch** (preserves current proposal flow).
  - `attachProposal` unset (plain `+Worktree`) → **Check out existing branch**.
  - "From a pull request" remains never-default (consistent with PR change's lazy-load contract).

### Server (independent of PR change)

- `POST /api/git/worktree` accepts `newBranch` as optional. When omitted, server runs `git worktree add <path> <ref>` (no `-b`).
- `addWorktree()` in `packages/server/src/git-operations.ts` makes `newBranch` optional and branches the git command shape accordingly.
- The existing `branch_in_use` error code stays in use; the `message` field is enriched with the path of the worktree currently holding the branch (parsed from git stderr) so the UI can render a clear inline error.

Note: the PR change adds a separate endpoint `POST /api/git/worktree/from-pr` for PR mode. The branch-mode endpoint (`POST /api/git/worktree`) is untouched by the PR change, so this proposal's server-side modification is orthogonal and can land independently in either order.

## Impact

### Affected specs

- `git-operations-api` — modifies Create worktree endpoint requirement (`newBranch` optional; new behaviour branch + enriched `branch_in_use` message). Independent of PR change.
- `worktree-spawn-dialog` — extends the toggle and refines the default-mode logic introduced by `add-worktree-from-pull-request`.

### Affected code

- `packages/server/src/git-operations.ts` — `AddWorktreeOptions.newBranch?: string`; branch git command in `addWorktree()`; enriched `branch_in_use` stderr parse.
- `packages/server/src/routes/git-routes.ts` — body validation: `newBranch` optional.
- `src/client/lib/git-api.ts` — `createWorktree()` helper: `newBranch?` optional.
- `packages/client/src/components/WorktreeSpawnDialog.tsx` — widen `mode` type from binary to ternary; rename existing "From a branch" option to "Fork to new branch"; add "Check out existing branch" branch with its picker reuse + path derivation; refine the default-mode `useEffect`.

### Migration / compatibility

- **Wire format**: `newBranch` becomes optional in the existing POST body. Old clients always send it → fully backward compatible.
- **Persisted state**: none. No migrations.
- **Rollback**: revert the four files. The dialog reverts to binary (PR change's state) or unary (if PR change is also reverted). No on-disk state, no irreversible ops.

### Risks

- **Race**: branch is unattached at dialog-load but checked out elsewhere by submit time. Mitigation: server's existing `branch_in_use` mapping covers it; UI maps to enriched message.
- **DWIM remote-only branch**: picking `origin/foo` when no local `foo` exists. `git worktree add <path> foo` auto-creates local `foo` tracking `origin/foo`. UI shows the local-name candidate to make the result predictable.
- **Dependency drift**: if `add-worktree-from-pull-request` changes its toggle shape between drafting and merge of this proposal, the dialog delta needs a rebase. Mitigation: the toggle's public contract (radio group with controlled `mode` state in the create section) is small; rebase cost is low.
- **Scope creep**: explicitly out — `--detach` mode, picker filtering to "available branches only" (server rejects with enriched message instead).
