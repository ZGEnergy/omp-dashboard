## MODIFIED Requirements

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
