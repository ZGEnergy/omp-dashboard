## ADDED Requirements

### Requirement: Per-session sidecar stores dashboard state
The system SHALL store all dashboard-owned per-session state in a `.meta.json` sidecar file next to the session's `.jsonl` file. The `.meta.json` filename SHALL match the `.jsonl` filename with the extension replaced.

#### Scenario: Dashboard-owned fields persisted
- **WHEN** a session has dashboard-set properties (name, attachedProposal, hidden, source)
- **THEN** those properties SHALL be written to the session's `.meta.json` file

#### Scenario: Cached stats persisted
- **WHEN** a session accumulates stats (tokens, cost, model, status, timestamps, context usage)
- **THEN** those stats SHALL be cached in the session's `.meta.json` file

#### Scenario: Meta file co-located with session file
- **WHEN** a session file exists at `~/.pi/agent/sessions/<cwd>/<ts>_<uuid>.jsonl`
- **THEN** the meta file SHALL be at `~/.pi/agent/sessions/<cwd>/<ts>_<uuid>.meta.json`

### Requirement: All meta fields are optional
The system SHALL treat all fields in `.meta.json` as optional. A minimal file with only `{ "source": "dashboard" }` SHALL be valid and backward-compatible with existing sidecar files.

#### Scenario: Minimal meta file
- **WHEN** a `.meta.json` contains only `{ "source": "dashboard" }`
- **THEN** the system SHALL read it without error and use defaults for missing fields

#### Scenario: Empty or missing meta file
- **WHEN** a `.jsonl` file has no corresponding `.meta.json`
- **THEN** the system SHALL treat the session as having no dashboard-owned state

### Requirement: Independent debounced writes per session
The system SHALL debounce `.meta.json` writes independently per session. A change to session A SHALL NOT trigger a write for session B. Pending writes SHALL be flushed on server shutdown.

#### Scenario: Single session update
- **WHEN** session A receives a token update
- **THEN** only session A's `.meta.json` SHALL be written (after debounce)

#### Scenario: Multiple sessions update concurrently
- **WHEN** sessions A and B both receive updates within the debounce window
- **THEN** each session's `.meta.json` SHALL be written independently

#### Scenario: Server shutdown flushes pending writes
- **WHEN** the server shuts down with pending `.meta.json` writes
- **THEN** all pending writes SHALL be flushed before exit

### Requirement: Atomic meta file writes
The system SHALL use atomic write operations (write-to-temp + rename) for `.meta.json` files to prevent corruption on crash.

#### Scenario: Crash during write
- **WHEN** the server crashes while writing a `.meta.json` file
- **THEN** the previous valid version SHALL remain intact

### Requirement: Session discovery by filesystem scan
The system SHALL discover sessions at startup by scanning all subdirectories under `~/.pi/agent/sessions/`. For each `.meta.json` file with a corresponding `.jsonl` file, the system SHALL restore the session from cached data.

#### Scenario: Startup with cached meta files
- **WHEN** the server starts and `.meta.json` files exist with cached stats
- **THEN** sessions SHALL be restored from `.meta.json` without parsing `.jsonl` files

#### Scenario: Session file without meta file
- **WHEN** a `.jsonl` file exists without a corresponding `.meta.json`
- **THEN** the system SHALL read the `.jsonl` header for session identity (id, cwd) and optionally extract stats, then write a `.meta.json` for future startups

#### Scenario: Orphaned meta file without session file
- **WHEN** a `.meta.json` file exists without a corresponding `.jsonl` file
- **THEN** the system SHALL ignore the orphaned `.meta.json`

#### Scenario: All directories scanned regardless of pin status
- **WHEN** the server starts
- **THEN** the system SHALL scan all directories under `~/.pi/agent/sessions/`, not just pinned directories

#### Scenario: Bridge reconnects after restart
- **WHEN** a session is restored from `.meta.json` and the bridge later reconnects with the same session ID
- **THEN** the bridge registration SHALL overwrite the stale cached entry with live data

### Requirement: Real cwd from meta cache
The system SHALL cache the real `cwd` in `.meta.json` (sourced from the `.jsonl` header) because the directory encoding is lossy (dashes are ambiguous).

#### Scenario: Cwd resolved from meta
- **WHEN** a `.meta.json` contains a `cwd` field
- **THEN** the system SHALL use that cwd value instead of attempting to decode the directory name

#### Scenario: Cwd fallback to jsonl header
- **WHEN** a `.meta.json` does not contain a `cwd` field
- **THEN** the system SHALL read the `.jsonl` header to determine the real cwd
