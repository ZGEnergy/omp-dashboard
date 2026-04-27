## MODIFIED Requirements

### Requirement: Change-detection gate to avoid redundant CLI invocations
The server SHALL support an mtime-based change-detection gate that skips `openspec list` / `openspec status` CLI invocations when no tracked artifact in `openspec/changes/` has changed since the last successful poll. The gate SHALL be controlled by `DashboardConfig.openspec.changeDetection` with values `"mtime"` (default) and `"always"` (re-poll unconditionally, matching pre-change behavior).

The gate SHALL use **file-aware effective mtime** rather than directory mtime alone, because POSIX directory mtime does not advance when a file inside the directory is edited in place.

#### Scenario: List-step gate signal
- **WHEN** `changeDetection` is `"mtime"` and the cache has a previous `listResult`
- **THEN** the server SHALL compute the list-step effective mtime as the maximum of:
  - `mtime(<cwd>/openspec/changes/)`
  - `mtime(<cwd>/openspec/changes/<name>/tasks.md)` for each `<name>` in the cached list result
- **AND** the server SHALL skip `openspec list` and reuse the cached `listResult` when this effective mtime equals the cached value

#### Scenario: Per-change status-step gate signal
- **WHEN** `changeDetection` is `"mtime"` and the per-change cache has an entry for `<name>`
- **THEN** the server SHALL compute the per-change effective mtime as the maximum of:
  - `mtime(<cwd>/openspec/changes/<name>/)`
  - `mtime(<cwd>/openspec/changes/<name>/tasks.md)`
  - `mtime(<cwd>/openspec/changes/<name>/proposal.md)`
  - `mtime(<cwd>/openspec/changes/<name>/design.md)`
- **AND** the server SHALL skip `openspec status --change <name>` and reuse the cached entry when this effective mtime equals the cached value
- **AND** missing files (e.g. a change with no `design.md`) SHALL be excluded from the maximum (treated as "skip"), not treated as zero or `NaN`

#### Scenario: Unchanged directory skips list CLI
- **WHEN** the list-step effective mtime matches the cached value
- **THEN** the server SHALL reuse the cached `list` result and SHALL NOT spawn `openspec list`

#### Scenario: Unchanged change skips status CLI
- **WHEN** the per-change effective mtime matches the cached value for that change
- **THEN** the server SHALL reuse the cached status entry and SHALL NOT spawn `openspec status --change <name>`

#### Scenario: In-place edit to tasks.md re-runs status
- **WHEN** an external actor (the user's IDE, the agent's `Edit` tool, the openspec CLI's `change update`) writes new content to `openspec/changes/foo/tasks.md` without renaming or recreating the file
- **THEN** on the next gated poll the server SHALL spawn `openspec list` exactly once
- **AND** SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change in the same directory
- **AND** the resulting `openspec_update` broadcast SHALL carry the new `completedTasks` value

#### Scenario: In-place edit to proposal.md or design.md re-runs status
- **WHEN** an external actor writes new content to `openspec/changes/foo/proposal.md` or `openspec/changes/foo/design.md` without renaming
- **THEN** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change

#### Scenario: Change added or removed
- **WHEN** a new change directory appears, or an existing one is deleted or archived
- **THEN** `mtime(<cwd>/openspec/changes/)` SHALL advance, causing `openspec list` to run
- **AND** the per-change cache SHALL be pruned of entries no longer present in the list result

#### Scenario: First poll with no cached list result
- **WHEN** the cache for a directory has no `listResult` (e.g. server start, freshly added directory)
- **THEN** the gate SHALL be skipped and `openspec list` SHALL run unconditionally

#### Scenario: Change-detection disabled
- **WHEN** `changeDetection` is `"always"`
- **THEN** the server SHALL run `openspec list` and all `openspec status` invocations on every poll tick (matching pre-change behavior)

#### Scenario: Force refresh uses the gate (not bypass)
- **WHEN** `openspec_refresh { cwd }` is received, or `refreshOpenSpec(cwd)` is called by server code, or `onDirectoryAdded(cwd)` runs
- **THEN** the change-detection gate SHALL be evaluated with the file-aware effective mtime
- **AND** the CLI SHALL be invoked only for the list step and per-change steps whose effective mtime has advanced
- **AND** the gate SHALL still be honored — force-mode is no longer required for correctness, because the gate now correctly reflects in-place file edits

NOTE: This scenario reverses the previous "Force refresh bypasses the gate" contract from the original `optimize-openspec-poll-burst` change. The previous contract was a workaround for the directory-mtime blind spot; with the fixed signal, force-mode bypass would just be wasted spawns.
