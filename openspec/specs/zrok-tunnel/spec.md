## ADDED Requirements

### Requirement: Zrok enrollment detection
The tunnel module SHALL detect whether zrok is enrolled on the current machine by checking for the existence and validity of `~/.zrok2/environment.json` (v2) or `~/.zrok/environment.json` (v1), preferring v2. If the file exists and contains valid JSON with `api_endpoint`, `ziti_identity`, and `zrok_token` fields, zrok is considered enrolled.

#### Scenario: Zrok is enrolled
- **WHEN** `~/.zrok2/environment.json` or `~/.zrok/environment.json` exists with valid `api_endpoint`, `ziti_identity`, and `zrok_token`
- **THEN** the module SHALL report zrok as enrolled and return the parsed config

#### Scenario: Zrok is not enrolled
- **WHEN** neither `~/.zrok2/environment.json` nor `~/.zrok/environment.json` exists
- **THEN** the module SHALL report zrok as not enrolled

#### Scenario: Zrok config is malformed
- **WHEN** the environment file exists but contains invalid JSON
- **THEN** the module SHALL report zrok as not enrolled and not throw

### Requirement: Public share creation
The tunnel module SHALL create a public proxy share by spawning `zrok share public --headless localhost:{port}` as a child process. The module SHALL parse the public URL from the process stdout and store the child process reference for cleanup.

#### Scenario: Successful share creation
- **WHEN** the `zrok share public` process starts and prints a public URL to stdout
- **THEN** the module SHALL return the public URL and store the process reference for cleanup

#### Scenario: Share creation fails
- **WHEN** the `zrok share public` process fails to start or exits with an error
- **THEN** the module SHALL log a warning and return null (server continues without tunnel)

#### Scenario: Subprocess crashes during operation
- **WHEN** the `zrok share public` process exits unexpectedly after initial URL was obtained
- **THEN** the module SHALL log a warning and update tunnel status to inactive

### Requirement: Share cleanup
The tunnel module SHALL kill the `zrok share public` child process on server shutdown and remove the PID file.

#### Scenario: Clean shutdown
- **WHEN** the server stops and a zrok subprocess is running
- **THEN** the module SHALL kill the subprocess and remove the PID file

#### Scenario: Cleanup fails
- **WHEN** killing the subprocess fails
- **THEN** the module SHALL log a warning and continue shutdown

#### Scenario: No share to clean up
- **WHEN** the server stops but no zrok subprocess is running
- **THEN** the module SHALL skip cleanup without errors

### Requirement: Tunnel lifecycle integration
The server SHALL create the tunnel after `fastify.listen()` completes and delete it during `server.stop()`. The public URL SHALL be printed to the console.

#### Scenario: Server starts with zrok enrolled and tunnel enabled
- **WHEN** the server starts, zrok is enrolled, zrok binary is available, and `tunnel.enabled` is true
- **THEN** the server SHALL spawn the zrok subprocess and print `🌐 Tunnel: <url>`

#### Scenario: Server starts with zrok not enrolled
- **WHEN** the server starts but zrok is not enrolled
- **THEN** the server SHALL skip tunnel creation silently and start normally

#### Scenario: Server starts with tunnel disabled
- **WHEN** the server starts with `tunnel.enabled` set to false (via config or `--no-tunnel`)
- **THEN** the server SHALL skip tunnel creation

### Requirement: Tunnel URL availability for auth
The tunnel module SHALL expose the active tunnel URL so that the auth module can use it to construct OAuth redirect URIs. The `createTunnel()` function SHALL store the tunnel URL and provide a `getTunnelUrl()` function to retrieve it.

#### Scenario: Tunnel created — URL available
- **WHEN** `createTunnel()` succeeds and returns a URL
- **THEN** `getTunnelUrl()` SHALL return that URL

#### Scenario: No tunnel — URL is null
- **WHEN** no tunnel has been created (zrok not enrolled, disabled, or creation failed)
- **THEN** `getTunnelUrl()` SHALL return null

#### Scenario: Tunnel deleted — URL cleared
- **WHEN** `deleteTunnel()` is called
- **THEN** `getTunnelUrl()` SHALL return null

### Requirement: Zrok binary detection
The tunnel module SHALL detect whether the `zrok` binary is available on the system PATH using `which zrok` (Unix) or `where zrok` (Windows).

#### Scenario: Zrok binary is available
- **WHEN** `which zrok` (or `where zrok`) succeeds
- **THEN** the module SHALL report zrok as available

#### Scenario: Zrok binary is not available
- **WHEN** `which zrok` (or `where zrok`) fails
- **THEN** the module SHALL report zrok as unavailable

### Requirement: Stale process cleanup
The tunnel module SHALL write the zrok subprocess PID to `~/.pi/dashboard/zrok.pid` when creating a tunnel. On server start, the module SHALL check for a stale PID file and kill the associated process if it is still running and is a zrok process.

#### Scenario: Stale PID file exists with running zrok process
- **WHEN** the server starts and `~/.pi/dashboard/zrok.pid` exists with a PID that is still running
- **THEN** the module SHALL kill the stale process and remove the PID file

#### Scenario: Stale PID file exists but process is not running
- **WHEN** the server starts and `~/.pi/dashboard/zrok.pid` exists but the PID is not running
- **THEN** the module SHALL remove the stale PID file

#### Scenario: No stale PID file
- **WHEN** the server starts and no `~/.pi/dashboard/zrok.pid` exists
- **THEN** the module SHALL proceed without cleanup

### Requirement: Tunnel status endpoint
The server SHALL expose `GET /api/tunnel-status` returning the current tunnel state as a discriminated union on `status` with values `"active"`, `"inactive"`, or `"unavailable"`. When active, the response SHALL include `url` (string) and `serverOs` (string). When inactive or unavailable, only `serverOs` SHALL be present.

#### Scenario: Tunnel is active
- **WHEN** a zrok tunnel is running
- **THEN** the endpoint SHALL return `{ status: "active", url: "<public-url>", serverOs: "<os>" }`

#### Scenario: Tunnel is inactive but zrok is available
- **WHEN** no tunnel is running but zrok binary is installed
- **THEN** the endpoint SHALL return `{ status: "inactive", serverOs: "<os>" }`

#### Scenario: Zrok is not installed
- **WHEN** the zrok binary is not found on PATH
- **THEN** the endpoint SHALL return `{ status: "unavailable", serverOs: "<os>" }`

#### Scenario: Tunnel status after tunnel creation
- **WHEN** the server starts with zrok enrolled and tunnel enabled, and the tunnel is successfully created
- **THEN** subsequent calls to `GET /api/tunnel-status` SHALL return status `"active"` with the tunnel URL

### Requirement: Tunnel connect endpoint
The server SHALL expose `POST /api/tunnel-connect` to start the tunnel on demand. If the tunnel is already active, it SHALL return the existing URL. If zrok is unavailable, it SHALL return an error.

#### Scenario: Connect when inactive
- **WHEN** `POST /api/tunnel-connect` is called and zrok is available but no tunnel is running
- **THEN** the server SHALL call `createTunnel()` and return `{ ok: true, url: "<url>" }`

#### Scenario: Connect when already active
- **WHEN** `POST /api/tunnel-connect` is called and a tunnel is already running
- **THEN** the server SHALL return `{ ok: true, url: "<existing-url>" }` without creating a new tunnel

#### Scenario: Connect when zrok unavailable
- **WHEN** `POST /api/tunnel-connect` is called and zrok is not installed
- **THEN** the server SHALL return `{ ok: false, error: "zrok not installed" }`

### Requirement: Tunnel disconnect endpoint
The server SHALL expose `POST /api/tunnel-disconnect` to stop the active tunnel.

#### Scenario: Disconnect when active
- **WHEN** `POST /api/tunnel-disconnect` is called and a tunnel is running
- **THEN** the server SHALL call `deleteTunnel()` and return `{ ok: true }`

#### Scenario: Disconnect when not active
- **WHEN** `POST /api/tunnel-disconnect` is called and no tunnel is running
- **THEN** the server SHALL return `{ ok: true }` (idempotent)
