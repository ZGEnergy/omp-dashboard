## MODIFIED Requirements

### Requirement: Git branch detection
The bridge extension SHALL detect the current git branch by running `git rev-parse --abbrev-ref HEAD` in the session's `cwd`. If the command fails (not a git repo), the branch SHALL be `undefined`. The extension SHALL also detect whether the CWD is a git worktree by checking if `<cwd>/.git` is a file (not a directory). If it is a file, `isWorktree` SHALL be `true`.

#### Scenario: Session in a git repository
- **WHEN** the extension gathers git info in a directory that is a git repository
- **THEN** the extension SHALL detect the current branch name

#### Scenario: Session not in a git repository
- **WHEN** the extension gathers git info in a directory that is not a git repository
- **THEN** the branch SHALL be `undefined` and no git info SHALL be sent

#### Scenario: Detached HEAD
- **WHEN** the git repository is in a detached HEAD state
- **THEN** the branch SHALL be the value returned by git (e.g., "HEAD") and no branch link SHALL be generated

#### Scenario: Session in a git worktree
- **WHEN** the extension gathers git info in a directory where `.git` is a file (not a directory)
- **THEN** `isWorktree` SHALL be `true`

#### Scenario: Session in main repo checkout
- **WHEN** the extension gathers git info in a directory where `.git` is a directory
- **THEN** `isWorktree` SHALL be `false` or `undefined`
