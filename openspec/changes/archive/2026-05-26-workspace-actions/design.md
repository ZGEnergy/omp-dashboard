## Context

The process manager (`src/server/process-manager.ts`) already implements `spawnPiSession(cwd)` via tmux but has no REST endpoint. The sidebar group headers (both pinned and unpinned) show editor buttons but no action buttons for spawning sessions or creating worktrees. Git worktree creation needs a server endpoint that runs `git worktree add`.\n\n**Note**: The workspace system (`workspace-store.ts`, `WorkspaceBar.tsx`, `AddWorkspaceDialog.tsx`) was removed by `pinned-directories` (2026-03-27). Groups now use `PinDirectoryDialog.tsx` for adding directories. Action buttons integrate with the current `SessionList.tsx` group header structure.

## Goals / Non-Goals

**Goals:**
- Expose spawn-session as a REST endpoint
- Add "Add pi-agent" button on group headers
- Add "Add worktree" button on group headers with a dialog for branch name
- Create `POST /api/git/worktree` endpoint

**Non-Goals:**
- Worktree detection/display (handled by worktree-awareness change)
- Filesystem browsing for workspace creation (handled by filesystem-browser change)
- Worktree deletion or management beyond creation

## Decisions

### 1. Spawn session endpoint
**Decision**: Add `POST /api/spawn-session` accepting `{ cwd: string }`. Localhost-only. Calls existing `spawnPiSession(cwd)`. Returns `{ success, message }`.

**Rationale**: Reuses existing process manager. Simple REST wrapper. Validates CWD exists on disk (not necessarily a known session — user may want to spawn in an empty workspace).

### 2. Git worktree endpoint
**Decision**: Add `POST /api/git/worktree` accepting `{ cwd: string, branchName: string, worktreePath?: string }`. Localhost-only. Runs `git worktree add -b <branchName> <worktreePath> <baseBranch>` where `baseBranch` is detected from the CWD's current branch. If `worktreePath` is omitted, derive it as `<parent-of-cwd>/<cwd-basename>-<branchName>`.

**Rationale**: Auto-deriving the worktree path as a sibling directory is the most common pattern. The base branch is the CWD's current branch, which matches the user's expectation of "branch off from here."

### 3. Action buttons placement
**Decision**: Add icon buttons to the group header action area (alongside existing editor buttons): a `+` pi icon for "Add pi-agent" and a `⎇+` icon for "Add worktree". Both are localhost-only (hidden on remote access like editor buttons).

**Rationale**: Keeps all group-level actions in one row. Consistent with existing editor button pattern.

### 4. Add worktree dialog
**Decision**: Simple modal dialog with:
- Branch name input (required)
- Auto-derived worktree path (editable, shown as preview)
- Base branch display (read-only, from group's detected branch)
- Create / Cancel buttons

**Rationale**: Minimal UI. Most users only need to type the branch name; the path is auto-derived.

### 5. Client API functions
**Decision**: Add `spawnSession(cwd)` and `createWorktree(cwd, branchName, worktreePath?)` to a new `src/client/lib/workspace-api.ts` module following the same pattern as `editor-api.ts`.

**Rationale**: DRY — consistent API helper pattern across the client.

## Risks / Trade-offs

- **[Git worktree errors]** → If the branch already exists or the path is taken, git will fail. Mitigation: return the git error message in the API response and show in the dialog.
- **[tmux not available]** → Spawn will fail on systems without tmux. Mitigation: existing process-manager already returns a clear error message; show it as toast.
- **[CWD validation]** → Spawn endpoint validates path exists on disk but doesn't require it to be a known session CWD. Mitigation: acceptable — users should be able to spawn into workspace folders that have no sessions yet.
