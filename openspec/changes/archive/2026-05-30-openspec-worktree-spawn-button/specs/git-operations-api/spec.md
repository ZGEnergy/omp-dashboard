## ADDED Requirements

### Requirement: Orphan worktree path cleanup endpoint
The server SHALL expose `POST /api/git/worktree/orphan-cleanup` (localhost-gated) accepting `{ cwd: string, path: string }`. The endpoint SHALL delete `path` from disk if and only if ALL of the following hold:

- `path` is inside `cwd` (anti-traversal),
- `path` exists and is a directory,
- `path` is NOT present in `git worktree list --porcelain` for `cwd`,
- `path` does NOT contain any `.git` entry (file or directory) at its top level,
- `path` contains no more than 20 files (default cap),
- no single file at `path` exceeds 1 MB (default cap).

Refusals SHALL return stable error codes: `outside_repo`, `not_a_directory`, `looks_like_worktree`, `too_many_files`, `file_too_large`, `not_orphan` (path is in worktree list — refuse). On success the endpoint returns `{ ok: true }`.

The endpoint is designed for one purpose: unblocking the worktree-spawn dialog when a previous failed attempt left an orphan directory. It is deliberately conservative — anything that looks like real work refuses.

#### Scenario: Cleanup succeeds on small orphan dir
- **WHEN** `path` exists, is a directory, contains only 2 stray files (e.g. `tsconfig.json`, `vitest.config.ts`), has no `.git` entry, and is NOT in the worktree list
- **THEN** the endpoint SHALL delete the directory recursively and return `{ ok: true }` with HTTP 200

#### Scenario: Refuse on registered worktree
- **WHEN** `path` IS present in `git worktree list --porcelain`
- **THEN** the endpoint SHALL refuse with code `not_orphan` and HTTP 409
- **THEN** the directory SHALL NOT be touched

#### Scenario: Refuse when .git entry present
- **WHEN** the orphan dir contains a top-level `.git` file or directory
- **THEN** the endpoint SHALL refuse with code `looks_like_worktree` and HTTP 409

#### Scenario: Refuse on too many files
- **WHEN** the orphan dir contains more than 20 files at any depth
- **THEN** the endpoint SHALL refuse with code `too_many_files` and HTTP 409

#### Scenario: Refuse on large file
- **WHEN** any file inside the orphan dir exceeds 1 MB
- **THEN** the endpoint SHALL refuse with code `file_too_large` and HTTP 409

#### Scenario: Refuse on path-traversal attempt
- **WHEN** `path` is not under `cwd` (e.g. `/etc/passwd` or `../../somewhere`)
- **THEN** the endpoint SHALL refuse with code `outside_repo` and HTTP 400

### Requirement: path_exists envelope carries orphanLikely
The `POST /api/git/worktree` endpoint SHALL extend its `path_exists` error envelope with a boolean `orphanLikely` field. The field SHALL be `true` when the target path exists on disk but is NOT present in `git worktree list --porcelain`, and `false` otherwise (including when the path IS a registered worktree).

#### Scenario: Orphan dir collision sets orphanLikely true
- **WHEN** the target path exists on disk and is NOT a registered worktree
- **THEN** the response body SHALL be `{ ok: false, code: "path_exists", orphanLikely: true, ... }`

#### Scenario: Registered-worktree collision sets orphanLikely false
- **WHEN** the target path IS already a registered worktree
- **THEN** the response body SHALL be `{ ok: false, code: "path_exists", orphanLikely: false, ... }`
