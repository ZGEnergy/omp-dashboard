## ADDED Requirements

### Requirement: Spawn session API
The server SHALL expose `POST /api/spawn-session` accepting `{ cwd: string }`. It SHALL validate the path exists on disk, then call the process manager to spawn a pi session via tmux. The endpoint SHALL be localhost-only.

#### Scenario: Successful spawn
- **WHEN** a POST request is made with a valid existing directory path
- **THEN** the server SHALL call `spawnPiSession(cwd)` and return `{ success: true, message: "..." }`

#### Scenario: Non-existent path
- **WHEN** a POST request is made with a path that does not exist on disk
- **THEN** the server SHALL return `{ success: false, error: "path does not exist" }`

#### Scenario: Missing cwd
- **WHEN** a POST request is made without a `cwd` field
- **THEN** the server SHALL return `{ success: false, error: "cwd required" }`

#### Scenario: Remote access blocked
- **WHEN** a POST request originates from a non-loopback address
- **THEN** the server SHALL return `{ success: false, error: "localhost only" }`

#### Scenario: tmux not available
- **WHEN** tmux is not installed on the system
- **THEN** the server SHALL return the process manager's error message about tmux not being installed

### Requirement: Git worktree creation API
The server SHALL expose `POST /api/git/worktree` accepting `{ cwd: string, branchName: string, worktreePath?: string }`. It SHALL create a new git worktree by running `git worktree add -b <branchName> <worktreePath>` in the given CWD. The base branch SHALL be the CWD's current branch. If `worktreePath` is omitted, it SHALL be auto-derived as `<parent-of-cwd>/<basename>-<branchName>`. The endpoint SHALL be localhost-only.

#### Scenario: Successful worktree creation
- **WHEN** a POST request is made with valid cwd and branchName
- **THEN** the server SHALL run `git worktree add -b <branchName> <derivedPath>` and return `{ success: true, data: { worktreePath: "<path>" } }`

#### Scenario: Custom worktree path
- **WHEN** a POST request includes an explicit `worktreePath`
- **THEN** the server SHALL use the provided path instead of auto-deriving it

#### Scenario: Branch already exists
- **WHEN** the git command fails because the branch name already exists
- **THEN** the server SHALL return `{ success: false, error: "<git error message>" }`

#### Scenario: Not a git repository
- **WHEN** the CWD is not inside a git repository
- **THEN** the server SHALL return `{ success: false, error: "not a git repository" }`

#### Scenario: Missing parameters
- **WHEN** a POST request is made without `cwd` or `branchName`
- **THEN** the server SHALL return `{ success: false, error: "cwd and branchName required" }`

### Requirement: Add pi-agent action button
The session sidebar group header SHALL display an "Add pi-agent" icon button (visible on localhost only) that spawns a new pi session in the group's CWD via the spawn session API.

#### Scenario: Click add pi-agent
- **WHEN** a user clicks the "Add pi-agent" button on a group header
- **THEN** the client SHALL call `POST /api/spawn-session` with the group's CWD and show a toast with the result message

#### Scenario: Spawn error shown as toast
- **WHEN** the spawn API returns an error
- **THEN** a toast notification SHALL display the error message

#### Scenario: Hidden on remote
- **WHEN** the dashboard is accessed via a non-localhost URL
- **THEN** the "Add pi-agent" button SHALL NOT be displayed

### Requirement: Add worktree action button and dialog
The session sidebar group header SHALL display an "Add worktree" icon button (visible on localhost only) that opens a dialog to create a new git worktree.

The dialog SHALL show:
- Base branch (read-only, detected from the group's git branch)
- Branch name input (required)
- Worktree path preview (auto-derived as `<parent>/<basename>-<branchName>`, editable)
- Create and Cancel buttons

#### Scenario: Click add worktree
- **WHEN** a user clicks the "Add worktree" button on a group header
- **THEN** a dialog SHALL open with the base branch pre-filled from the group's git info

#### Scenario: Auto-derive path
- **WHEN** the user types branch name "feature/new-ui" in the dialog for CWD "/home/user/project"
- **THEN** the worktree path preview SHALL show "/home/user/project-feature/new-ui" (sibling directory)

#### Scenario: Create worktree success
- **WHEN** the user clicks Create and the API returns success
- **THEN** the dialog SHALL close and a toast SHALL show "Worktree created at <path>"

#### Scenario: Create worktree error
- **WHEN** the API returns an error (e.g., branch exists)
- **THEN** the dialog SHALL show the error inline without closing

#### Scenario: No git branch on group
- **WHEN** the group has no detected git branch
- **THEN** the "Add worktree" button SHALL NOT be displayed
