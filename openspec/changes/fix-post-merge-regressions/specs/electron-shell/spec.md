## MODIFIED Requirements

### Requirement: Server launch via tsx binary
The server SHALL be launched using the `tsx` binary (not `node --import tsx/esm`) to ensure proper `__dirname`/`__filename` shimming for CJS dependencies. The spawn SHALL pass `detach: false` to `spawnDetached` so the server inherits Electron's Windows Job Object and terminates when Electron exits, and so no console window flashes on Windows during spawn.

#### Scenario: tsx binary resolution
- **WHEN** the server needs to be launched
- **THEN** it SHALL find the `tsx` binary in `~/.pi-dashboard/node_modules/.bin/tsx` (managed) or system PATH

#### Scenario: Server launch with tsx
- **WHEN** launching the server
- **THEN** it SHALL spawn `tsx <cli.ts> --port <port> --pi-port <piPort>` with NODE_PATH including the bundled server's node_modules
- **AND** the `spawnDetached` call SHALL pass `detach: false`

#### Scenario: No console flash on Windows
- **WHEN** Electron launches the dashboard server on Windows
- **THEN** no `cmd.exe` or console window SHALL flash on screen during spawn (ensured by `detach: false` keeping the child inside Electron's Job Object)

#### Scenario: Server dies with Electron
- **WHEN** Electron exits without calling `stopServerIfNeeded()` (e.g. crash, SIGKILL)
- **THEN** the managed server process SHALL also terminate because it is bound to Electron's Windows Job Object (`detach: false`) or Unix parent (`detached: false`)

#### Scenario: Server launch logging
- **WHEN** the server is launched
- **THEN** it SHALL write launch diagnostics and server output to `~/.pi-dashboard/server.log`
