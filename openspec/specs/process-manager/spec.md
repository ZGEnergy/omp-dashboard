## ADDED Requirements

### Requirement: Spawn pi session in tmux
The process manager SHALL spawn new pi sessions inside tmux when triggered from the dashboard UI. All dashboard-spawned sessions SHALL run within a single tmux session named `pi-dashboard`.

The `spawnPiSession` function SHALL accept optional parameters:
- `sessionFile?: string` — path to a session JSONL file
- `mode?: "continue" | "fork"` — how to open the session

When `sessionFile` and `mode` are provided:
- `mode: "continue"` → `pi --session <sessionFile>`
- `mode: "fork"` → `pi --fork <sessionFile>`

When neither is provided, the behavior is unchanged (spawn a fresh `pi` session).

#### Scenario: First session spawn (no tmux session)
- **WHEN** a new session is requested and the `pi-dashboard` tmux session does not exist
- **THEN** the system SHALL create the tmux session with: `tmux new-session -d -s pi-dashboard -n "{workspace-name}" -c "{workspace-path}" "PI_DASHBOARD_SPAWNED=1 pi"`

#### Scenario: Subsequent session spawn (tmux session exists)
- **WHEN** a new session is requested and the `pi-dashboard` tmux session already exists
- **THEN** the system SHALL create a new window with: `tmux new-window -t pi-dashboard -n "{workspace-name}" -c "{workspace-path}" "PI_DASHBOARD_SPAWNED=1 pi"`

#### Scenario: Continue session spawn
- **WHEN** a resume is requested with `mode: "continue"` and a `sessionFile`
- **THEN** the tmux command SHALL use: `PI_DASHBOARD_SPAWNED=1 pi --session <sessionFile>`

#### Scenario: Fork session spawn
- **WHEN** a resume is requested with `mode: "fork"` and a `sessionFile`
- **THEN** the tmux command SHALL use: `PI_DASHBOARD_SPAWNED=1 pi --fork <sessionFile>`

#### Scenario: Workspace name as tmux window name
- **WHEN** a session is spawned for workspace "api-server"
- **THEN** the tmux window SHALL be named "api-server"

### Requirement: Platform detection
The process manager SHALL detect the host platform and use appropriate spawning strategies.

#### Scenario: macOS
- **WHEN** the server runs on macOS (`process.platform === "darwin"`)
- **THEN** the system SHALL use tmux (expected at `/usr/local/bin/tmux` or `/opt/homebrew/bin/tmux` or in PATH)

#### Scenario: Linux
- **WHEN** the server runs on Linux (`process.platform === "linux"`)
- **THEN** the system SHALL use tmux (expected in PATH)

#### Scenario: Windows with WSL
- **WHEN** the server runs on Windows (`process.platform === "win32"`) and WSL is available
- **THEN** the system SHALL spawn via `wsl tmux ...`

#### Scenario: Windows without WSL
- **WHEN** the server runs on Windows without WSL
- **THEN** the system SHALL attempt to spawn pi in a new cmd window: `start cmd /c "cd /d {path} && set PI_DASHBOARD_SPAWNED=1 && pi"`

### Requirement: tmux availability check
The system SHALL check for tmux availability before attempting to spawn and return a clear error if tmux is not installed.

#### Scenario: tmux not installed
- **WHEN** a user tries to spawn a session and tmux is not found in PATH
- **THEN** the system SHALL return an error: "tmux is not installed. Install it with: brew install tmux (macOS) or apt install tmux (Linux)"

#### Scenario: tmux check on server start
- **WHEN** the dashboard server starts
- **THEN** it SHALL check for tmux availability and log a warning if not found (but SHALL NOT prevent server startup)

### Requirement: Environment markers
The process manager SHALL set the `PI_DASHBOARD_SPAWNED=1` environment variable for all spawned pi sessions so the bridge extension can detect the source.

#### Scenario: Spawned session detected by bridge
- **WHEN** a pi session spawned by the dashboard starts and loads the bridge extension
- **THEN** the bridge extension SHALL detect `PI_DASHBOARD_SPAWNED=1` and report source as `tmux`

### Requirement: Spawn error handling
The process manager SHALL handle spawn failures gracefully and report errors to the requesting browser client.

#### Scenario: Spawn fails
- **WHEN** the tmux command fails (exit code non-zero)
- **THEN** the system SHALL return the error output to the browser and show it as a toast notification

#### Scenario: Workspace path no longer exists
- **WHEN** a spawn is requested for a workspace whose path has been deleted
- **THEN** the system SHALL return an error indicating the workspace path no longer exists
