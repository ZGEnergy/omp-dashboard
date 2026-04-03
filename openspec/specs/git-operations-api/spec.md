## ADDED Requirements

### Requirement: List branches endpoint
The server SHALL expose `GET /api/git/branches` (localhost-only) that returns all local and remote branches for a given directory.

#### Scenario: Successful branch listing
- **WHEN** `GET /api/git/branches?cwd=/path` is called for a git repository
- **THEN** the response SHALL include `current` (current branch name or short SHA), `detached` (boolean), and `branches` array
- **AND** each branch entry SHALL have `name` (string), `isRemote` (boolean), and `isCurrent` (boolean)
- **AND** branches SHALL be sorted by most recent committer date (descending)

#### Scenario: Not a git repository
- **WHEN** the `cwd` is not inside a git repository
- **THEN** the response SHALL return `{ success: false, error: "not a git repository" }`

#### Scenario: Remote branches included
- **WHEN** remote tracking branches exist
- **THEN** remote branches SHALL be included with `isRemote: true`
- **AND** the `refs/remotes/origin/` prefix SHALL be stripped to show just the branch name (e.g., `origin/feature-x`)
- **AND** `HEAD` pointer entries (e.g., `origin/HEAD`) SHALL be excluded

### Requirement: Checkout endpoint
The server SHALL expose `POST /api/git/checkout` (localhost-only) that switches branches with optional stash support.

#### Scenario: Clean checkout of local branch
- **WHEN** `POST /api/git/checkout` is called with `{ cwd, branch, stash: false }` and the working tree is clean
- **THEN** the server SHALL run `git checkout <branch>` and return `{ success: true }`

#### Scenario: Dirty working tree without stash
- **WHEN** the working tree has uncommitted changes and `stash` is `false`
- **THEN** the server SHALL return HTTP 409 with `{ success: false, dirty: true, files: string[] }`
- **AND** the files array SHALL contain the list of modified/untracked files from `git status --porcelain`

#### Scenario: Checkout with stash
- **WHEN** `stash` is `true` and the working tree is dirty
- **THEN** the server SHALL run `git stash push -u` before `git checkout <branch>`
- **AND** return `{ success: true, stashed: true }`

#### Scenario: Remote branch checkout
- **WHEN** the branch name starts with `origin/` and no local branch of that name exists
- **THEN** the server SHALL run `git checkout -b <local-name> <remote-name>` to create a local tracking branch

#### Scenario: Already on target branch
- **WHEN** the target branch is the current branch
- **THEN** the server SHALL return `{ success: true }` without running any git commands

### Requirement: Git init endpoint
The server SHALL expose `POST /api/git/init` (localhost-only) that initializes a git repository.

#### Scenario: Successful init
- **WHEN** `POST /api/git/init` is called with `{ cwd }` and the directory is not inside a git repository
- **THEN** the server SHALL run `git init` in the `cwd` and return `{ success: true }`

#### Scenario: Already a git repository
- **WHEN** the `cwd` is already inside a git repository
- **THEN** the server SHALL return `{ success: false, error: "already a git repository" }`

### Requirement: Stash pop endpoint
The server SHALL expose `POST /api/git/stash-pop` (localhost-only) that pops the most recent stash.

#### Scenario: Clean stash pop
- **WHEN** `POST /api/git/stash-pop` is called and the pop applies cleanly
- **THEN** the server SHALL return `{ success: true, conflicts: false }`

#### Scenario: Stash pop with conflicts
- **WHEN** the stash pop results in merge conflicts
- **THEN** the server SHALL return `{ success: true, conflicts: true }`

#### Scenario: No stash entries
- **WHEN** there are no stash entries to pop
- **THEN** the server SHALL return `{ success: false, error: "no stash entries" }`
