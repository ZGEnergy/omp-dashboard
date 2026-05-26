## Context

The bridge extension gathers git info via `git rev-parse --abbrev-ref HEAD` and sends it to the server. The `DashboardSession` type carries `gitBranch`, `gitBranchUrl`, `gitPrNumber`, `gitPrUrl`. The session card and group header both display `GitInfo` using the branch. The Zed editor is opened via `spawn("zed", [path])` — always opens/focuses, never creates a new window explicitly.

Git worktrees have a `.git` file (not directory) pointing to the main repo. `git rev-parse --git-common-dir` returns the main repo's `.git` path, while `--show-toplevel` returns the worktree's own root.

## Goals / Non-Goals

**Goals:**
- Detect if a session CWD is a worktree vs main repo checkout
- Show worktree folder name on session cards, branch on group headers
- Open Zed with `-n` flag when the directory is not already open

**Non-Goals:**
- Listing all worktrees for a repo (that's for workspace-actions change)
- Changing group header git display
- Supporting editors other than Zed for the `-n` behavior

## Decisions

### 1. Worktree detection method
**Decision**: In `git-info.ts`, check if `<cwd>/.git` is a file (not directory). If it is, the CWD is a worktree. Set `isWorktree: true` on the gathered info.

**Rationale**: This is the canonical way git marks worktrees — `.git` is a file containing `gitdir: <path>`. No extra git commands needed — just `fs.statSync`. Alternatives considered:
- `git worktree list` — heavier, parses output, not needed for boolean detection
- `git rev-parse --git-common-dir` comparison — works but more complex than a stat check

### 2. Data flow
**Decision**: Add `isWorktree?: boolean` to `DashboardSession` and `GitInfo`. The extension sends it via `session_register` and `git_info_update`. The server stores it in session state and forwards to browsers.

**Rationale**: Minimal protocol change — one optional boolean field. Backward compatible.

### 3. Session card display
**Decision**: When `session.isWorktree` is true, the `GitInfo` component on the session card shows `🌲 <folder-name>` (the last segment of `session.cwd`) instead of `⎇ <branch>`. The group header `GroupGitInfo` continues showing branch as before (no change).

**Rationale**: The worktree folder name IS the meaningful identifier when working in worktrees (e.g., `project-feature-branch`). The branch is still shown on the group header.

### 4. Zed open with new window
**Decision**: Modify the `POST /api/open-editor` endpoint. For Zed specifically, add `-n` flag to the args array. This creates a new workspace window if the directory isn't already open, and focuses the existing window if it is.

**Rationale**: `zed -n <path>` is idempotent for already-open directories but creates new windows for new ones. The current `zed <path>` silently does nothing when a different project is focused. `-n` gives explicit intent. Alternatives considered:
- `zed -a` (add to workspace) — not what we want, merges into existing window
- No flag change — current behavior doesn't open new windows for unknown dirs

### 5. Editor registry enhancement
**Decision**: Add an optional `openArgs` field to `EditorEntry` to specify extra CLI args per editor. Zed gets `openArgs: ["-n"]`. The open-editor endpoint prepends these args before the target path.

**Rationale**: Keeps the editor registry extensible. Other editors can add their own flags later without modifying the endpoint logic.

## Risks / Trade-offs

- **[Zed `-n` behavior]** → If user prefers Zed to add to existing workspace, `-n` forces a new window. Mitigation: this matches the user's stated preference for worktree-per-window workflow.
- **[`.git` file detection]** → Some exotic git setups might have `.git` as a file without being a worktree. Mitigation: extremely rare; the boolean is advisory, not critical.
