## Why

The dashboard displays git branch info as read-only text. Users who want to switch branches must leave the dashboard and use a terminal. Adding a branch selector with typeahead directly in the folder group header lets users switch branches without context-switching, with proper handling for dirty working trees (stash prompt) and remote branches.

## What Changes

- **New clickable branch icon** at the folder group level (`GroupGitInfo`). Clicking the branch icon opens a typeahead branch picker dialog.
- **Three icon states**: no git repo (dimmed icon → click to `git init`), detached HEAD (shows short SHA), normal branch (shows branch name).
- **BranchPicker dialog**: typeahead-filtered list of local and remote branches, sorted by most recent commit. Current branch marked with `●`. Remote branches shown in a separate visual section.
- **Checkout flow with dirty-state handling**: POST to checkout; if working tree is dirty, server returns 409 with changed file list. Client shows stash confirmation dialog. After stash + checkout, user is asked whether to pop the stash on the new branch.
- **New server API endpoints** (all localhost-only): `GET /api/git/branches`, `POST /api/git/checkout`, `POST /api/git/init`, `POST /api/git/stash-pop`.
- **Individual session `GitInfo`** remains read-only (worktree support planned separately).

## Capabilities

### New Capabilities
- `git-branch-selector`: Typeahead branch picker UI, checkout orchestration with stash/pop flow, git init support
- `git-operations-api`: Server-side git command endpoints (branches, checkout, init, stash-pop)

### Modified Capabilities
- `git-context`: Add detached HEAD detection (short SHA) to existing git info gathering

## Impact

- **Server**: New REST endpoints in `server.ts`, new `git-operations.ts` module
- **Client**: New `BranchPicker`, `BranchSwitchDialog` components; modified `GroupGitInfo` to be clickable; new `git-api.ts` fetch helpers
- **Extension**: Minor update to `git-info.ts` for detached HEAD short SHA
- **Shared**: New types in `rest-api.ts` for git API request/response shapes
- **No breaking changes**
