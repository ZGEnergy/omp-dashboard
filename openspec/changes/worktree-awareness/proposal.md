## Why

Git worktrees are common in multi-branch workflows — each worktree is a separate checkout directory with its own branch. The dashboard currently only detects branch names and shows them identically on group headers and session cards. When a session's CWD is a worktree, the card should show the worktree identity instead of the branch. The Zed editor open command should also target the worktree directory correctly, opening a new window when Zed doesn't already have the directory open.

## What Changes

- **Worktree detection in git-info**: Detect if a CWD is a git worktree (`.git` is a file, not a directory) and expose `isWorktree: boolean` and `worktreePath: string` on the session data.
- **Session card**: Show worktree folder name instead of branch when the session CWD is a worktree (e.g., "🌲 feature-worktree" instead of "⎇ feature/branch").
- **Group header**: Continue showing branch + PR as before (no change to group header git info).
- **Zed open behavior**: The `/api/open-editor` endpoint in `server.ts` (folder-level) should use `zed -n <path>` to create a new window when the directory is not already open in Zed. Always target the session's actual CWD (which is the worktree directory). Note: editor buttons are folder-level only (not on session cards).
- **DashboardSession type**: Add optional `isWorktree` field.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `git-context`: Add worktree detection (`git rev-parse --git-common-dir` vs `--show-toplevel`) and expose `isWorktree` flag.
- `session-sidebar`: Session card shows worktree name instead of branch when `isWorktree` is true.
- `open-in-editor`: Zed open command uses `-n` flag when directory is not already open in Zed.

## Impact

- **Files**: `packages/extension/src/git-info.ts`, `packages/shared/src/types.ts`, `packages/client/src/components/SessionCard.tsx`, `packages/server/src/server.ts` (open-editor endpoint — Zed `-n` flag)
- **Tests**: `git-info.test.ts`, `SessionCard.test.tsx`
- **Protocol**: `session_added` / `session_updated` messages gain optional `isWorktree` field (backward compatible).
