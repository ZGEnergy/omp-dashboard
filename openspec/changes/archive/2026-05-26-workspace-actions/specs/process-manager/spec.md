## MODIFIED Requirements

### Requirement: Spawn pi session in tmux
The process manager SHALL spawn new pi sessions inside tmux when triggered from the dashboard UI. All dashboard-spawned sessions SHALL run within a single tmux session named `pi-dashboard`. The spawn functionality SHALL be accessible via `POST /api/spawn-session` REST endpoint (localhost-only).

#### Scenario: First session spawn (no tmux session)
- **WHEN** a new session is requested and the `pi-dashboard` tmux session does not exist
- **THEN** the system SHALL create the tmux session with: `tmux new-session -d -s pi-dashboard -n "{workspace-name}" -c "{workspace-path}" "PI_DASHBOARD_SPAWNED=1 pi"`

#### Scenario: Subsequent session spawn (tmux session exists)
- **WHEN** a new session is requested and the `pi-dashboard` tmux session already exists
- **THEN** the system SHALL create a new window with: `tmux new-window -t pi-dashboard -n "{workspace-name}" -c "{workspace-path}" "PI_DASHBOARD_SPAWNED=1 pi"`

#### Scenario: Spawn via REST API
- **WHEN** a POST request is made to `/api/spawn-session` with `{ cwd: "/path/to/project" }`
- **THEN** the server SHALL call `spawnPiSession(cwd)` and return the result

#### Scenario: Workspace name as tmux window name
- **WHEN** a session is spawned for workspace "api-server"
- **THEN** the tmux window SHALL be named "api-server"
