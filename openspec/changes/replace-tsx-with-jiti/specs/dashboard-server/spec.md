## MODIFIED Requirements

### Requirement: Shutdown REST endpoint
The dashboard server SHALL expose a `POST /api/shutdown` endpoint that gracefully stops the server process. When called, it SHALL invoke the server's `stop()` method and then exit the process with code 0.

#### Scenario: Shutdown request
- **WHEN** a `POST /api/shutdown` request is received
- **THEN** the server SHALL respond with `{ ok: true }`, call `server.stop()`, and exit with `process.exit(0)`

#### Scenario: Shutdown during active sessions
- **WHEN** `POST /api/shutdown` is received while pi sessions are connected
- **THEN** the server SHALL still shut down gracefully — connected extensions will reconnect when a new server starts

_Note: No behavioral change — this requirement is included because the CLI file changes its shebang and daemon spawn mechanism._

## ADDED Requirements

### Requirement: Daemon spawn uses jiti loader
When the CLI `start` subcommand spawns itself as a background daemon, it SHALL use `getJitiImportArgs()` from the jiti-loader module to construct the spawn arguments instead of hardcoding `--import tsx`.

#### Scenario: Daemon spawn with jiti
- **WHEN** `pi-dashboard start` is executed
- **THEN** the daemon process SHALL be spawned with `node --import <jiti-register-path> cli.ts` instead of `node --import tsx cli.ts`

### Requirement: CLI bin entry resolves jiti at runtime
The `pi-dashboard` CLI entry point SHALL be a plain JavaScript file (`bin/pi-dashboard.mjs`) that resolves the jiti register path at runtime and re-execs Node.js with the appropriate `--import` flag.

#### Scenario: Direct CLI invocation
- **WHEN** a user runs `pi-dashboard status` from a shell
- **THEN** the JS wrapper SHALL resolve jiti, then exec `node --import <jiti-path> src/server/cli.ts status`
