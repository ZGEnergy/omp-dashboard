## MODIFIED Requirements

### Requirement: Spawn pi session supports headless strategy
The `spawnPiSession` function SHALL accept an optional `strategy` parameter (`"tmux" | "headless"`). When `"headless"`, it SHALL spawn `pi --mode rpc` as a child process instead of using tmux. When `"tmux"` or omitted, existing tmux behavior SHALL be preserved.

The `buildTmuxCommand` function SHALL shell-escape `cwd` and `sessionFile` parameters before interpolating them into the command string. The existing `shellEscape()` helper SHALL be reused for this purpose.

#### Scenario: Headless spawn fresh session
- **WHEN** `spawnPiSession(cwd, { strategy: "headless" })` is called
- **THEN** it SHALL spawn `pi --mode rpc` with `cwd` set and `PI_DASHBOARD_SPAWNED=1` in env
- **AND** return `{ success: true, message: "...", pid: <number> }`

#### Scenario: Headless spawn with continue
- **WHEN** `spawnPiSession(cwd, { strategy: "headless", sessionFile: "...", mode: "continue" })` is called
- **THEN** it SHALL spawn `pi --mode rpc --session <sessionFile>`

#### Scenario: Headless spawn with fork
- **WHEN** `spawnPiSession(cwd, { strategy: "headless", sessionFile: "...", mode: "fork" })` is called
- **THEN** it SHALL spawn `pi --mode rpc --fork <sessionFile>`

#### Scenario: Tmux spawn unchanged
- **WHEN** `spawnPiSession(cwd, { strategy: "tmux" })` or `spawnPiSession(cwd)` is called
- **THEN** existing tmux spawn behavior SHALL be used unchanged

#### Scenario: Tmux command escapes cwd with special characters
- **WHEN** `buildTmuxCommand` is called with a `cwd` containing shell metacharacters (e.g., spaces, semicolons, backticks)
- **THEN** the `cwd` SHALL be shell-escaped in the generated command string to prevent command injection

#### Scenario: Tmux command escapes sessionFile with special characters
- **WHEN** `buildTmuxCommand` is called with a `sessionFile` containing shell metacharacters
- **THEN** the `sessionFile` SHALL be shell-escaped in the generated command string to prevent command injection

### Requirement: SpawnResult includes pid for headless
The `SpawnResult` interface SHALL include an optional `pid?: number` field. For headless spawns, this SHALL be set to the child process PID. For tmux spawns, this SHALL be undefined.

#### Scenario: Headless result has pid
- **WHEN** a headless spawn succeeds
- **THEN** `SpawnResult.pid` SHALL be the spawned process PID

#### Scenario: Tmux result has no pid
- **WHEN** a tmux spawn succeeds
- **THEN** `SpawnResult.pid` SHALL be undefined

### Requirement: Electron mode forces headless spawn
When the server detects it was launched by an Electron app (via `electronMode` config flag), the spawn strategy SHALL be forced to `"headless"` regardless of the configured `spawnStrategy`, and tmux detection SHALL be skipped entirely.

#### Scenario: Electron mode forces headless
- **WHEN** `electronMode` is `true` in the server config
- **THEN** `spawnPiSession` SHALL use `"headless"` strategy regardless of `spawnStrategy` config
- **AND** SHALL NOT attempt tmux detection

### Requirement: Managed install PATH augmentation
When spawning pi sessions, the process manager SHALL prepend `~/.pi-dashboard/node_modules/.bin` to the spawned process's `PATH` environment variable so managed-install pi is discoverable.

#### Scenario: Managed pi on PATH for spawned sessions
- **WHEN** `spawnPiSession` spawns a process
- **THEN** the spawned process's `PATH` SHALL include `~/.pi-dashboard/node_modules/.bin`
