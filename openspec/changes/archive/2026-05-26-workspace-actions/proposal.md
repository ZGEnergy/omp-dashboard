> **Superseded by `add-worktree-spawn-dialog`** (different layout — `.worktrees/<slug>/` nested under the parent repo rather than sibling-directory `<repo>-<branch>`; adds the grouping fix for worktree sessions; unified dialog lists existing worktrees + creates new in one flow; auto-spawns on success; never implemented).

## Why

The sidebar group headers currently only show editor buttons. Users need quick actions to spawn new pi-agent sessions and create git worktrees directly from the dashboard without switching to a terminal. The process manager already supports tmux spawning but has no API endpoint. Git worktree creation is a common workflow for starting parallel work on a new branch.

## What Changes

- ~~**"Add pi-agent" button**~~: Already implemented — `spawn-session-btn` in `SessionList.tsx` uses WebSocket `spawn_session` message (shipped in `headless-spawn` + `placeholder-spawn-card` archives).
- **"Add worktree" button**: Action button on group headers that opens a dialog to create a git worktree. Runs `git worktree add -b <branch-name> <path>` where the base branch defaults to the group's detected branch. New `POST /api/git/worktree` endpoint.
- **Add worktree dialog**: Modal with branch name input, auto-derived worktree path (sibling directory), and confirmation.
- **Server endpoint**: `POST /api/git/worktree` (body: `{ cwd, branchName, worktreePath? }`), localhost-only.

## Capabilities

### New Capabilities

- `workspace-actions`: Action buttons on group headers for spawning pi-agent sessions and creating git worktrees, with corresponding server API endpoints.

### Modified Capabilities

- `session-sidebar`: Group headers gain "Add pi-agent" and "Add worktree" action buttons.
- `process-manager`: Expose spawning via REST API endpoint.

## Impact

- **Files**: `packages/server/src/routes/git-routes.ts` (new worktree endpoint), `packages/client/src/components/FolderActionBar.tsx` (worktree button), new `packages/client/src/components/AddWorktreeDialog.tsx`, new API client functions.
- **Note**: The workspace system was replaced by pinned directories (`2026-03-27-pinned-directories`). `AddWorkspaceDialog.tsx` no longer exists — group headers now use `PinDirectoryDialog.tsx`. Action buttons integrate with the current pinned/unpinned group header structure via `FolderActionBar.tsx`.
- **Note**: "Add pi-agent" spawning is already implemented (`FolderActionBar.tsx` `onSpawnSession`). Remaining scope is only the "Add worktree" button and `POST /api/git/worktree` endpoint.
- **Tests**: New endpoint tests, dialog tests, SessionList action tests.
- **Dependencies**: None. Uses existing `process-manager.ts` and `git` CLI.
