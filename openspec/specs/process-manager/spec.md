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
