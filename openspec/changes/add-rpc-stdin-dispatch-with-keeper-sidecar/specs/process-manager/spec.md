## MODIFIED Requirements

### Requirement: Spawn pi session supports headless strategy
The `spawnPiSession` function SHALL accept an optional `strategy` parameter (`"tmux" | "headless" | "wt" | "wsl-tmux"`). When `"headless"` AND the config flag `useRpcKeeper: true` is set, `spawnPiSession` SHALL spawn the keeper sidecar (see `rpc-keeper-sidecar` capability) instead of spawning pi directly. The keeper SHALL spawn pi as its own child.

When `"headless"` AND `useRpcKeeper: false` (default during phase 1), `spawnPiSession` SHALL retain its existing behavior:
- Unix: `sh -c 'tail -f /dev/null | pi --mode rpc'`
- Windows: detached spawn with `stdio: ["pipe", logFd, logFd]`

When the strategy is `"tmux"`, `"wt"`, or `"wsl-tmux"`, `spawnPiSession` SHALL retain existing behavior unchanged. These strategies do not use the keeper because pi's stdin is owned by the user's terminal, not by the dashboard.

The `buildTmuxCommand` function SHALL continue to shell-escape `cwd` and `sessionFile` parameters using `shellEscape()`.

#### Scenario: Headless spawn with keeper (useRpcKeeper: true)
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` is called AND config has `useRpcKeeper: true`
- **THEN** the server SHALL spawn the keeper process via `node <path>/keeper.cjs <sessionId>` (detached)
- **AND** the keeper SHALL spawn `pi --mode rpc` as its child with `cwd` and `PI_DASHBOARD_SPAWNED=1` in env
- **AND** the keeper SHALL listen on `<homedir>/.pi/dashboard/sessions/<sessionId>.rpc.sock` (Unix) or `\\.\pipe\pi-rpc-<sessionId>` (Windows)

#### Scenario: Headless spawn without keeper (legacy default)
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` is called AND config has `useRpcKeeper: false` or unset
- **THEN** the server SHALL spawn pi directly using the legacy mechanism (Unix `tail -f` wrapper or Windows piped stdin)
- **AND** the keeper SHALL NOT be invoked

#### Scenario: Tmux spawn unaffected by keeper flag
- **WHEN** `spawnPiSession(cwd, {strategy: "tmux"})` is called regardless of `useRpcKeeper` flag value
- **THEN** the existing tmux spawn behavior SHALL be used unchanged
- **AND** no keeper SHALL be spawned for tmux sessions


### Requirement: spawnHeadless returns SpawnResult with both keeper and pi PIDs
When the keeper path is used, the `SpawnResult` returned by `spawnPiSession` SHALL include the keeper PID in `pid` (matching today's contract: `pid` is the spawn-time PID that may differ from the session's bridge-registered PID). The pi PID SHALL be reported separately via the keeper's PID file once the keeper has spawned pi successfully (typically within a few hundred milliseconds).

The `headlessPidRegistry.register(pid, cwd, proc)` call site SHALL register the keeper PID at spawn time. The pi PID SHALL be linked to the session later when the bridge inside pi sends `session_register` with its actual PID, via the existing token-correlation path (see `spawn-correlation` capability).

#### Scenario: SpawnResult.pid is keeper PID at spawn time
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` returns successfully with the keeper path
- **THEN** `result.pid` SHALL be the keeper process PID
- **AND** the keeper SHALL be tracked in `headlessPidRegistry` indexed by `cwd` and by `pid`

#### Scenario: Pi PID linked to session via token correlation
- **WHEN** the keeper's pi child starts and the bridge inside pi sends `session_register {pid: <pi PID>, spawnToken: <server-minted token>}`
- **THEN** `headlessPidRegistry` SHALL update the session entry to associate `pid: <pi PID>` with the registered sessionId
- **AND** the existing token-correlation logic SHALL handle the keeper-PID-vs-pi-PID distinction


### Requirement: Crash detection for keeper spawn
The 300ms `waitForNoCrash` window applied to direct pi spawns SHALL be applied to KEEPER spawns instead of pi spawns when the keeper path is used. If the keeper process crashes within 300ms of spawn (e.g. UDS bind failure, Node module-resolution error), `spawnPiSession` SHALL return `SpawnResult {success: false, code: "PI_CRASHED"}` with the keeper's stderr log tail.

The keeper itself SHALL apply its own crash-detection window to the pi child (300ms) and exit non-zero with a log entry if pi crashes during the window. This propagates to the dashboard server via the keeper's exit status, which the server detects via the spawn-register watchdog (existing).

#### Scenario: Keeper crashes immediately on spawn
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` is called AND the keeper crashes within 300ms
- **THEN** `result.success` SHALL be `false`
- **AND** `result.code` SHALL be `"PI_CRASHED"` (re-using existing error code; the user-facing error message MAY clarify "keeper crashed")
- **AND** `result.stderr` SHALL contain the tail of the keeper's stderr log

#### Scenario: Pi crashes inside the keeper
- **WHEN** the keeper spawns pi successfully but pi crashes within 300ms
- **THEN** the keeper SHALL exit non-zero
- **AND** the dashboard server's spawn-register watchdog SHALL detect the keeper's exit before the bridge registers
- **AND** the user SHALL see a `spawn_failed` event with details from the keeper's log file
