## MODIFIED Requirements

### Requirement: Headless spawn survives server restart (Unix)
On macOS and Linux, headless pi sessions SHALL be spawned via the keeper sidecar (see `rpc-keeper-sidecar` capability). The dashboard server SHALL spawn the keeper as a detached child process; the keeper SHALL spawn pi with `stdio: ["pipe", logFd, logFd]` and own pi's stdin pipe.

The keeper SHALL outlive the dashboard server. When the dashboard server exits, the keeper SHALL continue running with pi attached. When the new dashboard server starts, it SHALL discover the keeper via the socket-scan reconnect path (see `rpc-keeper-sidecar` Requirement "Server reconnect to existing keepers on startup") and resume RPC dispatch routing.

The legacy `sh -c "tail -f /dev/null | pi --mode rpc"` shell wrapper SHALL be retired. Durability is now provided by the keeper, not by the wrapper. The `headlessPidRegistry` SHALL track BOTH the keeper PID and the pi PID per session; the existing `byCwd / byPid / byToken` indexing handles the spawn-PID-vs-session-PID correlation as today (see `spawn-correlation` capability).

#### Scenario: Server exits while headless agent is running (Unix)
- **WHEN** the dashboard server exits (graceful `/api/shutdown` or SIGTERM) on macOS or Linux while a headless session is active
- **THEN** the session's keeper process SHALL continue running
- **AND** pi SHALL continue running with stdin still held by the keeper
- **AND** the bridge extension inside pi SHALL continue forwarding events over WebSocket (with reconnection backoff)

#### Scenario: New server reconnects to existing keeper on startup
- **WHEN** the new dashboard server starts and finds a `<sessionId>.rpc.sock` whose keeper PID and pi PID are both alive
- **THEN** the server SHALL register the session as RPC-dispatch-ready
- **AND** the server SHALL NOT spawn a new keeper for this session
- **AND** the server SHALL NOT kill the existing keeper or pi


### Requirement: Headless spawn on Windows uses keeper for durability parity
On Windows, headless pi sessions SHALL be spawned via the same keeper sidecar pattern as Unix. The keeper SHALL listen on a Windows named pipe (`\\.\pipe\pi-rpc-<sessionId>`) and own pi's stdin via `stdio: ["pipe", logFd, logFd]`.

This replaces the previous Windows behavior where the dashboard server piped pi's stdin directly (`process-manager.ts:480-525`), which meant pi died with the dashboard server on every restart. With the keeper, Windows now matches Unix: pi survives across dashboard server restarts.

#### Scenario: Server exits while headless agent is running (Windows)
- **WHEN** the dashboard server exits on Windows while a headless session is active
- **THEN** the session's keeper process SHALL continue running
- **AND** pi SHALL continue running with stdin held by the keeper
- **AND** when the new server starts, it SHALL reconnect via the named-pipe scan


### Requirement: Headless spawn cleanup tracks keeper PIDs
The `headlessPidRegistry` SHALL track keeper PIDs alongside pi PIDs per session. The registry's existing `cleanupOrphans` pass SHALL be extended to:

1. Scan `~/.pi/dashboard/sessions/*.rpc.sock` (Unix) or named-pipe directory (Windows) for keepers.
2. For each keeper found: verify its PID is alive (via `isProcessAlive`) and its corresponding pi PID is alive.
3. Kill orphan keepers (alive keeper, dead pi) and unlink their socket + PID sidecar files.
4. Remove stale socket files where the keeper PID is dead.

The cleanup SHALL run on dashboard server startup BEFORE any new keepers are spawned.

#### Scenario: Cleanup removes orphan keeper after pi crash
- **GIVEN** a keeper for session `<sid>` is alive but its pi child has crashed
- **WHEN** the dashboard server starts
- **THEN** the cleanup pass SHALL send SIGTERM to the keeper PID
- **AND** SHALL unlink `<sid>.rpc.sock` and `<sid>.rpc.sock.pid`
- **AND** the session SHALL not be registered as RPC-dispatch-ready


### Requirement: Headless spawn opt-in feature flag during rollout
The keeper-mediated spawn SHALL be gated behind a config flag `useRpcKeeper: boolean` in `~/.pi/dashboard/config.json`. When `false` (default during phase 1 rollout), `spawnHeadless` SHALL retain its current behavior (`tail -f /dev/null | pi --mode rpc` on Unix, direct stdin pipe on Windows). When `true`, `spawnHeadless` SHALL use the keeper.

This flag SHALL be removed in a future change after the keeper has been validated across one release cycle. Tasks for the future change include: flip default to `true`, retire the legacy non-keeper code paths, document migration in CHANGELOG.

#### Scenario: Default behavior is unchanged
- **GIVEN** `useRpcKeeper` is not set in config or set to `false`
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` is called
- **THEN** the legacy non-keeper spawn path SHALL be used
- **AND** the keeper code SHALL NOT be invoked

#### Scenario: Keeper enabled via config flag
- **GIVEN** `useRpcKeeper: true` in config
- **WHEN** `spawnPiSession(cwd, {strategy: "headless"})` is called
- **THEN** the keeper sidecar SHALL be spawned
- **AND** the keeper SHALL spawn pi as its child
