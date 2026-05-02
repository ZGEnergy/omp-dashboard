## ADDED Requirements

### Requirement: Repo MUST ignore jj workspace directories

The repo-root `.gitignore` SHALL list `.shadow/` so that jj workspace clones created via `jj workspace add` under `.shadow/<name>/` are excluded from `git status`, `git add`, and `git commit` from the main worktree.

#### Scenario: Workspace exists, status is clean

- **WHEN** a contributor has one or more `jj workspace add` targets under `.shadow/<name>/` and runs `git status` in the main worktree
- **THEN** no `.shadow/...` paths appear in the output

#### Scenario: Bulk add does not stage workspace files

- **WHEN** a contributor runs `git add .` from the repo root with `.shadow/<name>/` populated
- **THEN** no files under `.shadow/` are added to the git index
