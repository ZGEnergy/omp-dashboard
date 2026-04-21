## ADDED Requirements

### Requirement: Per-HOME advisory lock
The dashboard server SHALL acquire a per-HOME advisory lock at `<realpath(os.homedir())>/.pi/dashboard/server.lock` via `proper-lockfile` before listening on its configured ports. Only one dashboard instance per HOME MAY hold the lock at a time.

#### Scenario: Fresh acquire
- **WHEN** no prior dashboard has run for this HOME
- **AND** `pi-dashboard` starts
- **THEN** the lock is acquired successfully
- **AND** a metadata sidecar `server.lock.meta.json` is written with `{ pid, httpPort, piPort, startedAt, identity, version, url, hostname }`

#### Scenario: Lock held by alive instance
- **WHEN** another dashboard instance is running and holds the lock
- **AND** a new `pi-dashboard` starts
- **THEN** the new instance reads the metadata sidecar
- **AND** verifies via `isProcessAlive(pid) && isDashboardRunning(httpPort)` with matching identity
- **AND** attaches by invoking `openBrowser(meta.url)` and exiting with code 0

#### Scenario: Stale lock (process dead)
- **WHEN** the lock file exists but the recorded PID is dead
- **THEN** `proper-lockfile`'s stale detection (configured staleDuration: 10s) reports the lock as stale
- **AND** the new instance steals the lock
- **AND** removes the stale metadata sidecar

#### Scenario: Identity mismatch
- **WHEN** the lock is held and the PID is alive
- **AND** `isDashboardRunning(httpPort)` succeeds but returns a different identity than the metadata
- **THEN** the new instance exits with code 1 and an error message: "Port <n> is in use by an unrelated process (PID <n>). Configure a different port or stop that process."

### Requirement: HOME canonicalization
All HOME-scoped paths (lock file, metadata, settings.json) SHALL be derived from `fs.realpathSync(os.homedir())`. The `$HOME` environment variable SHALL NOT be used for lock path derivation — `$HOME` override would allow GUI-launched and shell-launched processes to disagree on HOME identity.

#### Scenario: Symlinked homedir canonicalizes
- **WHEN** `os.homedir()` returns `/Users/robson` which is a symlink to `/System/Volumes/Data/Users/robson`
- **THEN** the lock path uses the realpath target consistently across all invocations

#### Scenario: $HOME override ignored
- **WHEN** `$HOME=/c/Users/robson` but `os.homedir()=C:\Users\robson` (Git Bash on Windows)
- **THEN** the lock path is computed from `realpathSync(os.homedir())` and both shells produce the same path

### Requirement: Graceful release
On graceful shutdown (SIGINT, SIGTERM, SIGHUP, explicit `/api/shutdown`), the dashboard SHALL release the lock and delete the metadata sidecar before exiting.

#### Scenario: SIGTERM triggers release
- **WHEN** the dashboard receives SIGTERM
- **THEN** the signal handler calls `release()` and removes `server.lock.meta.json`
- **AND** the process exits with code 0

#### Scenario: Hard kill leaves lock for stale detection
- **WHEN** the dashboard is killed with SIGKILL or `taskkill /F`
- **THEN** the lock file remains
- **AND** the next startup's `proper-lockfile.lock()` detects it as stale via heartbeat timeout (10s default)

### Requirement: Multi-user support
Two real users on the same host SHALL be able to run their own dashboards independently. Each user's HOME produces a separate lock path.

#### Scenario: Two users, two dashboards
- **WHEN** user A (`/home/alice`) and user B (`/home/bob`) each run `pi-dashboard`
- **THEN** each acquires their own lock
- **AND** neither interferes with the other

#### Scenario: Port collision handled separately
- **WHEN** user A's dashboard listens on 8000
- **AND** user B's `pi-dashboard` starts
- **THEN** the startup auto-increments to 8001 with a log message
- **AND** the port-choice mechanism is orthogonal to the HOME lock

### Requirement: Restart handoff
The `/api/restart` flow SHALL hand off the lock cleanly: old process releases, orchestrator waits for lock to become available, new process acquires.

#### Scenario: Clean restart
- **WHEN** `POST /api/restart` fires
- **AND** the old server exits gracefully (releases lock)
- **THEN** the orchestrator polls `proper-lockfile.check()` until the lock is free (timeout 10s)
- **AND** spawns the new server which acquires the lock

#### Scenario: Restart with hung old server
- **WHEN** the old server fails to exit within the restart grace period
- **THEN** the orchestrator kills it (existing behavior)
- **AND** the lock becomes stale and is stolen by the new instance

### Requirement: Escape hatch
Setting environment variable `PI_DASHBOARD_ALLOW_MULTIPLE=1` SHALL skip lock acquisition entirely. This is unsupported behavior for power users and testing; it is documented but not advertised.

#### Scenario: Env var disables lock
- **WHEN** `PI_DASHBOARD_ALLOW_MULTIPLE=1` is set
- **AND** `pi-dashboard` starts
- **THEN** no lock acquisition is attempted
- **AND** no metadata sidecar is written
- **AND** the startup log contains a warning "PI_DASHBOARD_ALLOW_MULTIPLE set — HOME-scoped races may cause corruption"

### Requirement: Metadata sidecar robustness
The metadata sidecar (`server.lock.meta.json`) SHALL be written atomically (tmp + rename) and tolerated when corrupt (treated as stale).

#### Scenario: Atomic write survives crash mid-write
- **WHEN** the server crashes during metadata write
- **THEN** the existing metadata file is either the old valid version or the new valid version — never a partial write

#### Scenario: Corrupt metadata treated as stale
- **WHEN** the metadata file contains malformed JSON
- **THEN** the new instance's liveness check returns "assume stale"
- **AND** the lock is stolen

## MODIFIED Requirements

### Requirement: Server PID file becomes advisory
The existing `server-pid.ts` PID file SHALL continue to be written for back-compat with external tooling, but the lock file is the authoritative source of instance identity.

#### Scenario: PID file still written
- **WHEN** the dashboard starts
- **THEN** both `server-pid.txt` (existing) and `server.lock.meta.json` (new) are written

#### Scenario: Conflict resolution
- **WHEN** PID file and lock metadata disagree (e.g., old PID file lingers)
- **THEN** lock metadata wins — PID file is silently overwritten on lock acquisition
