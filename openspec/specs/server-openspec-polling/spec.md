## Purpose

Server-side OpenSpec CLI polling per directory. The server polls each known directory (pinned dirs + session cwds) at a configurable interval and broadcasts results keyed by cwd to connected browsers, replacing the previous per-session bridge-side polling.

To avoid burst CPU usage when many active changes exist across multiple pinned directories, the scheduler layers four optimizations: a configurable interval (default 30 s), an mtime-based change-detection gate that skips re-polling unchanged proposals, a concurrency cap on CLI spawns, and a deterministic per-cwd jitter that staggers polls within each interval. All four are runtime-reconfigurable via `DashboardConfig.openspec`.
## Requirements
### Requirement: Server polls openspec CLI per directory
The server SHALL run `openspec list --json` and `openspec status --change <name> --json` for each known directory at a **configurable interval** (default 30 seconds, range 5–3600 seconds, controlled by `DashboardConfig.openspec.pollIntervalSeconds`) and broadcast results keyed by cwd to connected browsers. Each directory's poll SHALL be offset within the interval by a deterministic per-cwd phase (range 0 to `DashboardConfig.openspec.jitterSeconds`, default 5 s) so that polls do not all align on the same tick.

#### Scenario: Periodic poll for a known directory
- **WHEN** one poll interval has elapsed since the last poll for a directory
- **THEN** the server SHALL evaluate the directory for re-polling (subject to change detection, see below) and broadcast an `openspec_update` message with `cwd` and `data` fields if the data has changed

#### Scenario: Configurable interval
- **WHEN** `DashboardConfig.openspec.pollIntervalSeconds` is set to 60
- **THEN** the server SHALL poll every 60 seconds instead of 30
- **AND** changing this value via `PUT /api/config` SHALL take effect without a server restart

#### Scenario: Deterministic per-cwd phase offset
- **WHEN** three known directories exist and `jitterSeconds` is 5
- **THEN** each directory's poll SHALL fire at a stable offset in `[0, 5000) ms` derived from a hash of its cwd
- **AND** the same cwd SHALL receive the same offset on every tick

#### Scenario: Initial poll on server startup
- **WHEN** the server starts with known directories
- **THEN** the server SHALL poll openspec for each known directory and broadcast initial results to any connected browsers

#### Scenario: New directory becomes known
- **WHEN** a new pinned directory is added or a session registers with a new cwd
- **THEN** the server SHALL immediately poll openspec for that directory (bypassing both jitter and change detection for this first poll)

#### Scenario: openspec CLI not available
- **WHEN** `openspec` is not installed or the directory is not an openspec project
- **THEN** the server SHALL cache `{ initialized: false, changes: [] }` for that directory

#### Scenario: Browser requests immediate refresh
- **WHEN** a browser sends `openspec_refresh` with a `cwd` field
- **THEN** the server SHALL immediately re-poll the openspec CLI for that directory, **bypassing change detection** but still respecting the concurrency cap, and broadcast the result

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

### Requirement: Concurrency cap on openspec CLI spawns
The server SHALL cap the number of concurrent `openspec` CLI invocations across all directories and all changes at `DashboardConfig.openspec.maxConcurrentSpawns` (default 3, range 1–16). Invocations exceeding the cap SHALL queue FIFO and run as slots free up. Force-refresh paths SHALL also honor the cap.

#### Scenario: Burst is serialized
- **WHEN** 20 directories each need 5 `openspec status` invocations at once and `maxConcurrentSpawns` is 3
- **THEN** at most 3 `openspec` child processes SHALL be running simultaneously
- **AND** all 100 invocations SHALL complete in sequence without errors

#### Scenario: Resize takes effect without restart
- **WHEN** `maxConcurrentSpawns` is changed from 3 to 8 via `PUT /api/config`
- **THEN** the semaphore SHALL immediately allow up to 8 concurrent spawns for new work
- **AND** in-flight spawns under the old cap SHALL be unaffected

#### Scenario: Refresh storm is throttled
- **WHEN** a browser sends 20 `openspec_refresh` messages concurrently for the same cwd
- **THEN** at most `maxConcurrentSpawns` openspec CLI invocations SHALL be in flight at any time

### Requirement: OpenSpec data keyed by directory in browser protocol
The server SHALL send `openspec_update` messages to browsers keyed by `cwd` instead of `sessionId`.

#### Scenario: Browser receives openspec_update
- **WHEN** the server broadcasts an openspec_update
- **THEN** the message SHALL contain `{ type: "openspec_update", cwd: string, data: OpenSpecData }` with no sessionId field

#### Scenario: Browser connects and receives initial state
- **WHEN** a browser WebSocket connects
- **THEN** the server SHALL send cached `openspec_update` messages for all known directories that have initialized OpenSpec data

### Requirement: Deduplicated polling across sessions
The server SHALL poll each directory at most once per polling interval, regardless of how many sessions are registered for that directory.

#### Scenario: Multiple sessions in same directory
- **WHEN** three sessions are registered for `/project/foo`
- **THEN** the server SHALL run the openspec CLI at most once per interval for `/project/foo`, not three times

