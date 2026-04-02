## Context

The dashboard shows git branch info as read-only text in `GroupGitInfo` (folder level) and `GitInfo` (session level). Git operations (`git-info.ts`) run in the bridge extension. The server has no git command endpoints. The `PathPicker` component provides a proven typeahead pattern with keyboard navigation. The `DialogPortal` component handles modal rendering.

Currently the `GroupGitInfo` component renders the branch icon + name/link + PR info but has no interactive behavior.

## Goals / Non-Goals

**Goals:**
- Clickable branch icon at folder group level that opens a typeahead branch picker
- Support three states: no git (init button), detached HEAD, normal branch
- List local and remote branches sorted by most recent commit
- Handle dirty working tree: prompt to stash, then optionally pop after checkout
- New localhost-only server API for git operations

**Non-Goals:**
- Individual session-level branch switching (planned for worktree support later)
- Branch creation, deletion, or merge operations
- Git commit, push, or pull operations
- Stash management beyond the single stash-and-pop flow

## Decisions

### 1. Server-side git execution via new `git-operations.ts` module

**Decision**: All git commands run on the server, not in the bridge extension. New module `src/server/git-operations.ts` with pure functions that shell out to `git`.

**Rationale**: The server already has localhost-guarded endpoints for file operations and editor launching. Git operations follow the same pattern — they're directory-level actions, not session-specific. The bridge extension's `git-info.ts` remains read-only for polling.

**Alternatives**: Running git via the bridge extension would require new protocol messages and complicate the flow since the UI talks to the server, not the extension.

### 2. 409 Conflict pattern for dirty working tree

**Decision**: `POST /api/git/checkout` attempts checkout directly. If the working tree is dirty, it returns `409 { dirty: true, files: string[] }` without modifying anything. The client then shows a stash confirmation and re-sends with `stash: true`.

**Rationale**: One round-trip in the clean case (most common). No separate dirty pre-check endpoint needed. The 409 status code semantically fits — the request conflicts with the current state.

**Alternatives**: A separate `GET /api/git/status` pre-check would always require two round-trips.

### 3. BranchPicker modeled after PathPicker

**Decision**: New `BranchPicker.tsx` component reusing the same keyboard-first pattern as `PathPicker`: text input with typeahead filtering, ↑↓ navigation, Enter to select, Escape to cancel. Wrapped in a `BranchSwitchDialog` that orchestrates the multi-step checkout flow.

**Rationale**: Proven UX pattern already in the codebase. Users familiar with the path picker will immediately understand the branch picker.

### 4. Branches sorted by committer date

**Decision**: `git branch -a --sort=-committerdate --format=...` to list all branches, most recently committed first.

**Rationale**: Users most often want to switch to branches they've been working on recently. Alphabetical ordering buries active branches.

### 5. Remote branch checkout creates local tracking branch

**Decision**: When the user selects a remote branch like `origin/feature-x`, the server runs `git checkout -b feature-x origin/feature-x` to create a local tracking branch.

**Rationale**: Standard git workflow. Users expect to work on a local branch, not a detached HEAD.

### 6. Stash pop is a separate user decision

**Decision**: After stash + checkout succeeds, the client asks "Pop stash on new branch?" with explicit Yes/No. Pop is a separate `POST /api/git/stash-pop` call.

**Rationale**: The stashed changes may not apply cleanly to the target branch. Making it explicit gives the user control. If conflicts occur, the response indicates it.

### 7. GroupGitInfo becomes the entry point, GitInfo stays read-only

**Decision**: Only the `GroupGitInfo` component (folder-level) gets the clickable branch icon. Individual `GitInfo` on session cards remains display-only.

**Rationale**: Branch switching affects all sessions in a directory. Per-session switching is planned for worktree support later.

## Risks / Trade-offs

- **[Long-running git operations]** → Commands like `git stash` or checkout on large repos may be slow. Mitigation: show a loading spinner in the dialog; commands already have reasonable timeouts.
- **[Stale branch list]** → Branch list is fetched once when picker opens. Mitigation: acceptable for the typical use case; user can close and reopen to refresh.
- **[Concurrent sessions affected by checkout]** → All sessions in a `cwd` share the same working tree. Mitigation: sessions auto-detect branch changes via the existing 30s git info poll; the UI updates naturally.
- **[Git init in a subdirectory]** → User might accidentally init git in a non-root directory. Mitigation: only show init when `git rev-parse --is-inside-work-tree` fails for the `cwd`.
