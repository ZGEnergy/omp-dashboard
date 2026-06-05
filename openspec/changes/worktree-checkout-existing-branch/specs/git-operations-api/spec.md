# git-operations-api delta

## MODIFIED Requirements

### Requirement: Create worktree endpoint

The server SHALL expose `POST /api/git/worktree` (localhost-only) creating a new git worktree. Request body: `{ cwd: string, base: string, newBranch?: string, path?: string, force?: boolean }`.

The endpoint SHALL:

1. Realpath-validate `cwd` and confirm it is inside a git repository.
2. Derive `path` if absent:
   - When `newBranch` is provided: `<repo-root>/.worktrees/<slug(newBranch)>`.
   - When `newBranch` is absent: `<repo-root>/.worktrees/<slug(localNameOf(base))>` where `localNameOf("origin/foo") === "foo"` and `localNameOf("foo") === "foo"`.
   The repo root SHALL be resolved via `git rev-parse --git-common-dir` of `cwd` and walked to its parent (the main worktree), so that the path lands consistently regardless of which sibling worktree opened the dialog.
3. Refuse with `path_exists` if the derived or supplied path already exists on disk and is not empty.
4. Run the appropriate git command:
   - When `newBranch` is provided: `git worktree add -b <newBranch> <path> <base>` (fork mode; current behaviour).
   - When `newBranch` is absent: `git worktree add <path> <base>` (checkout mode; relies on git DWIM to create a tracking branch when `base` is `origin/<x>` and no matching local branch exists).
   - `--force` SHALL be passed when `force === true` in either mode.
5. On success, append the line `.worktrees/` to `<repo-root>/.git/info/exclude` iff that exact line is not already present. SHALL NOT touch `.gitignore`. SHALL NOT fail the request if the exclude-write fails (log warning, continue).
6. Return `{ path: string, branch: string }`. In checkout mode, `branch` SHALL be the locally-checked-out branch name (for `base = "origin/foo"` DWIM, `branch === "foo"`, not `"origin/foo"`).

The endpoint SHALL NOT run any initialization or dependency-install step. Initialization is delegated to the gated, manually-triggered worktree-init hook (`GET /api/git/worktree/init-status` + `POST /api/git/worktree/init`).

Error response shape: `{ success: false, error: <code>, message: <human>, stderr?: string }`. Stable codes: `not_a_repo`, `cwd_invalid`, `branch_in_use`, `branch_exists`, `path_exists`, `base_not_found`, `git_failed`.

When the server maps a git error to `branch_in_use`, the `message` field SHALL include the path of the worktree currently holding the branch when git's stderr exposes it (pattern `already used by worktree at '<path>'`). When the path cannot be parsed, the message SHALL fall back to a generic phrasing.

#### Scenario: Fork mode — successful create with auto-derived path

- **WHEN** `POST /api/git/worktree` is called with `{ cwd: "/repo", base: "develop", newBranch: "feat/dark-mode" }`
- **THEN** the server SHALL derive path `/repo/.worktrees/feat-dark-mode`
- **AND** run `git worktree add -b feat/dark-mode /repo/.worktrees/feat-dark-mode develop`
- **AND** return `{ path: "/repo/.worktrees/feat-dark-mode", branch: "feat/dark-mode" }`

#### Scenario: Checkout mode — existing local branch

- **WHEN** `POST /api/git/worktree` is called with `{ cwd: "/repo", base: "stale-feature" }` (no `newBranch`)
- **AND** local branch `stale-feature` exists and is not checked out in any worktree
- **THEN** the server SHALL derive path `/repo/.worktrees/stale-feature`
- **AND** run `git worktree add /repo/.worktrees/stale-feature stale-feature`
- **AND** return `{ path: "/repo/.worktrees/stale-feature", branch: "stale-feature" }`

#### Scenario: Checkout mode — remote-only branch DWIM

- **WHEN** `POST /api/git/worktree` is called with `{ cwd: "/repo", base: "origin/old-experiment" }` (no `newBranch`)
- **AND** no local branch `old-experiment` exists
- **THEN** the server SHALL derive path `/repo/.worktrees/old-experiment` (NOT `/repo/.worktrees/origin-old-experiment`)
- **AND** run `git worktree add /repo/.worktrees/old-experiment origin/old-experiment`
- **AND** git SHALL create local branch `old-experiment` tracking `origin/old-experiment`
- **AND** the server SHALL return `{ path: "/repo/.worktrees/old-experiment", branch: "old-experiment" }`

#### Scenario: Checkout mode — branch already checked out elsewhere

- **WHEN** `POST /api/git/worktree` is called with `{ cwd: "/repo", base: "foo" }` (no `newBranch`)
- **AND** branch `foo` is already checked out in worktree at `/repo/.worktrees/bar`
- **THEN** the server SHALL return `{ success: false, error: "branch_in_use", message: <text including "/repo/.worktrees/bar">, stderr: <git output> }`

#### Scenario: No auto-init on create

- **WHEN** a worktree is created (in either mode) for a repo that declares a `worktreeInit` hook
- **THEN** the create endpoint SHALL NOT execute the hook

#### Scenario: Idempotent exclude append

- **WHEN** the worktree is created and `.git/info/exclude` already contains the line `.worktrees/`
- **THEN** the server SHALL NOT append a duplicate line

#### Scenario: Localhost-only

- **WHEN** the request originates from a non-loopback address not in the trusted bypass set
- **THEN** the response SHALL be the standard auth-block envelope
