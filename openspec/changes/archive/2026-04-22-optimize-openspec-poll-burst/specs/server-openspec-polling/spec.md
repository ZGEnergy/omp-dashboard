## MODIFIED Requirements

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
The server SHALL support an mtime-based change-detection gate that skips `openspec list` / `openspec status` CLI invocations for directories whose `openspec/changes/` or `openspec/changes/<name>/` mtime has not advanced since the last successful poll. The gate SHALL be controlled by `DashboardConfig.openspec.changeDetection` with values `"mtime"` (default) and `"always"` (re-poll unconditionally, matching pre-change behavior).

#### Scenario: Unchanged directory skips list CLI
- **WHEN** `changeDetection` is `"mtime"` and `fs.stat(openspec/changes).mtimeMs` equals the value recorded in the directory cache
- **THEN** the server SHALL reuse the cached `list` result and SHALL NOT spawn `openspec list`

#### Scenario: Unchanged change skips status CLI
- **WHEN** `changeDetection` is `"mtime"` and `fs.stat(openspec/changes/<name>).mtimeMs` equals the cached value for that change
- **THEN** the server SHALL reuse the cached status entry and SHALL NOT spawn `openspec status --change <name>`

#### Scenario: Mtime advances for one change
- **WHEN** a user edits `openspec/changes/foo/tasks.md`
- **THEN** on the next poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for the other unchanged changes

#### Scenario: Change added or removed
- **WHEN** a new change directory appears, or an existing one is deleted or archived
- **THEN** the top-level `openspec/changes` mtime SHALL advance, causing `openspec list` to run
- **AND** the per-change cache SHALL be pruned of entries no longer present in the list result

#### Scenario: Change-detection disabled
- **WHEN** `changeDetection` is `"always"`
- **THEN** the server SHALL run `openspec list` and all `openspec status` invocations on every poll tick (matching pre-change behavior)

#### Scenario: Force refresh bypasses the gate
- **WHEN** `openspec_refresh { cwd }` is received, or `refreshOpenSpec(cwd)` is called by server code, or `onDirectoryAdded(cwd)` runs
- **THEN** the change-detection gate SHALL be bypassed and the CLI SHALL be invoked for `list` and for every change in the resulting list

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
