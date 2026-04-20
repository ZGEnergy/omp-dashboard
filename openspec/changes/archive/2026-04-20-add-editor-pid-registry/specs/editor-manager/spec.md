## ADDED Requirements

### Requirement: Persistent editor PID registry
The dashboard server SHALL persist a record of every spawned `code-server` instance to a JSON file at `~/.pi/dashboard/editor-pids.json`. Each record SHALL include the editor `id`, OS `pid`, bound `port`, `cwd`, `--user-data-dir` path (`dataDir`), and spawn timestamp (`spawnedAt`). Records SHALL be added after the instance becomes `ready` and removed when the instance stops or its child process exits.

#### Scenario: Record added after ready
- **WHEN** an editor instance transitions from `starting` to `ready`
- **THEN** an entry SHALL be written to `~/.pi/dashboard/editor-pids.json` containing `{ id, pid, port, cwd, dataDir, spawnedAt }`

#### Scenario: Record removed on child exit
- **WHEN** the spawned `code-server` child process emits `exit`
- **THEN** the corresponding entry SHALL be removed from `~/.pi/dashboard/editor-pids.json`

#### Scenario: Record removed on explicit stop
- **WHEN** `EditorManager.stop(id)` is called for a tracked instance
- **THEN** the corresponding entry SHALL be removed from `~/.pi/dashboard/editor-pids.json` synchronously, before SIGTERM is sent

#### Scenario: Persistence failure does not break editor lifecycle
- **WHEN** writing `~/.pi/dashboard/editor-pids.json` fails (disk full, permission denied, etc.)
- **THEN** the editor instance SHALL still start, stop, and operate normally
- **THEN** the failure SHALL be silently absorbed (best-effort persistence)

### Requirement: Orphan code-server cleanup on server boot
On server startup, before accepting any new editor `start` requests, the dashboard server SHALL read `~/.pi/dashboard/editor-pids.json` and, for each persisted entry, attempt to terminate the corresponding `code-server` process if it is verified as a dashboard-spawned orphan. After processing, the registry file SHALL be cleared.

#### Scenario: Live verified orphan is terminated
- **WHEN** server boot reads a persisted entry whose PID is alive AND whose OS-reported command line contains `--user-data-dir` with a path under `~/.pi/dashboard/editors/`
- **THEN** the server SHALL send `SIGTERM` to that PID
- **THEN** if the process is still alive after a 1 second grace period, the server SHALL send `SIGKILL`

#### Scenario: Dead PID is skipped
- **WHEN** server boot reads a persisted entry whose PID is no longer alive
- **THEN** no signal SHALL be sent
- **THEN** the entry SHALL be discarded

#### Scenario: PID reuse — command line does not match
- **WHEN** server boot reads a persisted entry whose PID is alive but whose command line does NOT contain `--user-data-dir` under `~/.pi/dashboard/editors/`
- **THEN** no signal SHALL be sent (the PID has been reused by an unrelated process)
- **THEN** the entry SHALL be discarded

#### Scenario: Command-line lookup fails
- **WHEN** server boot cannot determine the command line for a persisted PID (platform error, permission denied, etc.)
- **THEN** no signal SHALL be sent (cannot verify ownership)
- **THEN** the entry SHALL be discarded

#### Scenario: Missing or corrupt registry file
- **WHEN** `~/.pi/dashboard/editor-pids.json` does not exist or cannot be parsed at server boot
- **THEN** the server SHALL proceed normally with an empty registry
- **THEN** no error SHALL be thrown and startup SHALL not be blocked

#### Scenario: Registry cleared after sweep
- **WHEN** the orphan sweep completes (regardless of how many orphans were killed)
- **THEN** `~/.pi/dashboard/editor-pids.json` SHALL be rewritten to reflect only entries the new server's `EditorManager` has registered (initially empty)

### Requirement: Boot sweep runs before new editor starts are accepted
The orphan cleanup sweep SHALL execute during server initialization, before the editor REST routes (`POST /api/editor/start`) accept any requests. This SHALL prevent races between cleanup and a new spawn for the same `cwd` (and therefore the same `--user-data-dir`).

#### Scenario: Cleanup precedes route registration
- **WHEN** the server starts
- **THEN** `editorPidRegistry.cleanupOrphans()` SHALL complete
- **THEN** the editor REST routes SHALL be registered
- **THEN** any `POST /api/editor/start` request SHALL be served against a clean state
