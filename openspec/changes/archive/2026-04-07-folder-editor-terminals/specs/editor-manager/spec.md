## ADDED Requirements

### Requirement: Spawn code-server per folder
The EditorManager SHALL spawn a code-server child process for a given folder cwd. Each folder SHALL have at most one running instance. The instance SHALL bind to `127.0.0.1` on a dynamically allocated free port. The instance SHALL use `--auth none`, `--disable-telemetry`, `--disable-update-check`, and `--user-data-dir ~/.pi/dashboard/editors/<folder-hash>/`.

#### Scenario: Start instance for a folder
- **WHEN** `start(cwd)` is called and no instance exists for the cwd
- **THEN** a free port SHALL be allocated
- **THEN** code-server SHALL be spawned with `--bind-addr 127.0.0.1:<port>` and `--user-data-dir` based on a hash of the cwd
- **THEN** the manager SHALL wait until the port is accepting connections (ready probe)
- **THEN** it SHALL return `{ id, port, status: "ready" }`

#### Scenario: Instance already exists
- **WHEN** `start(cwd)` is called and an instance is already running for the cwd
- **THEN** the existing instance's `{ id, port }` SHALL be returned without spawning a new process

### Requirement: Stop instance
The EditorManager SHALL support stopping a running instance via SIGTERM. On process exit, all tracking state SHALL be cleaned up.

#### Scenario: Stop running instance
- **WHEN** `stop(id)` is called for a running instance
- **THEN** SIGTERM SHALL be sent to the code-server process
- **THEN** the instance SHALL be removed from tracking after exit

#### Scenario: Stop non-existent instance
- **WHEN** `stop(id)` is called for an unknown id
- **THEN** no error SHALL be thrown

### Requirement: Idle timeout
The EditorManager SHALL track the last heartbeat timestamp per instance. When no heartbeat has been received for `editor.idleTimeoutMinutes` (default 10), the instance SHALL be stopped automatically.

#### Scenario: Instance goes idle
- **WHEN** no heartbeat is received for 10 minutes (default)
- **THEN** the instance SHALL be stopped via SIGTERM
- **THEN** an `editor_status` message with status `stopped` SHALL be broadcast

#### Scenario: Heartbeat resets idle timer
- **WHEN** a heartbeat is received for an instance
- **THEN** the idle timer SHALL be reset to the full timeout duration

### Requirement: Max concurrent instances
The EditorManager SHALL enforce a maximum number of concurrent running instances (default 3, configurable via `editor.maxInstances`). When the cap is reached and a new start is requested, the oldest idle instance SHALL be stopped first. If no idle instance exists, the start SHALL fail with an error.

#### Scenario: Cap reached with idle instance
- **WHEN** the max instance cap is reached and a new start is requested
- **THEN** the instance with the oldest last-heartbeat timestamp SHALL be stopped
- **THEN** the new instance SHALL be started

#### Scenario: Cap reached with no idle instances
- **WHEN** the max instance cap is reached and all instances have recent heartbeats
- **THEN** the start request SHALL fail with `{ error: "max_instances_reached" }`

### Requirement: Reverse proxy route
The dashboard server SHALL register a reverse proxy route at `/editor/:id/*` that forwards all HTTP and WebSocket traffic to `http://127.0.0.1:<port>` of the corresponding code-server instance. The proxy SHALL handle WebSocket upgrade for code-server's LSP and terminal connections.

#### Scenario: HTTP request proxied
- **WHEN** a browser request arrives at `/editor/abc123/some/path`
- **THEN** the server SHALL forward it to `http://127.0.0.1:<port>/some/path`
- **THEN** the response SHALL be returned to the browser

#### Scenario: WebSocket upgrade proxied
- **WHEN** a WebSocket upgrade request arrives at `/editor/abc123/`
- **THEN** the server SHALL upgrade and proxy to `ws://127.0.0.1:<port>/`

#### Scenario: Unknown editor id
- **WHEN** a request arrives for an editor id with no running instance
- **THEN** the server SHALL respond with 404

### Requirement: Editor status broadcast
The EditorManager SHALL broadcast `editor_status` messages via the browser WebSocket when an instance's status changes (starting, ready, stopped).

#### Scenario: Instance started
- **WHEN** a code-server instance transitions to ready
- **THEN** an `editor_status` message SHALL be broadcast with `{ cwd, id, status: "ready" }`

#### Scenario: Instance stopped
- **WHEN** a code-server instance is stopped (idle timeout, manual stop, or crash)
- **THEN** an `editor_status` message SHALL be broadcast with `{ cwd, id, status: "stopped" }`

### Requirement: REST API endpoints
The server SHALL expose:
- `POST /api/editor/start` with body `{ cwd, theme? }` — starts or returns existing instance, writes VS Code settings.json with theme
- `POST /api/editor/:id/heartbeat` — resets idle timer
- `POST /api/editor/:id/stop` — stops instance
- `POST /api/editor/:id/theme` with body `{ theme }` — updates VS Code settings.json with new theme for a running instance
- `GET /api/editor/status` — returns all editor instances with their status
- `GET /api/editor/detect` — returns whether code-server binary is available

All endpoints SHALL be localhost-only.

#### Scenario: Start endpoint
- **WHEN** `POST /api/editor/start` is called with `{ cwd: "/path/to/project", theme: "dark" }`
- **THEN** the server SHALL write VS Code settings.json with dark theme
- **THEN** the server SHALL return `{ success: true, data: { id, status, proxyPath } }`

#### Scenario: Theme endpoint
- **WHEN** `POST /api/editor/:id/theme` is called with `{ theme: "light" }`
- **THEN** the server SHALL update VS Code settings.json with the light color theme
- **THEN** the server SHALL return `{ success: true }`

#### Scenario: Detect endpoint when binary exists
- **WHEN** `GET /api/editor/detect` is called and code-server is on PATH
- **THEN** the server SHALL return `{ success: true, data: { available: true, binary: "code-server" } }`

#### Scenario: Detect endpoint when binary missing
- **WHEN** `GET /api/editor/detect` is called and code-server is not found
- **THEN** the server SHALL return `{ success: true, data: { available: false } }`
