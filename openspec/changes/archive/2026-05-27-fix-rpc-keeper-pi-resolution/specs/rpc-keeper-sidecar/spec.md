## ADDED Requirements

### Requirement: Server-resolved pi command passed to keeper

When the dashboard server spawns an RPC keeper for a headless pi session, the server SHALL resolve the `pi` binary through `ToolRegistry.resolvePiCommand()` BEFORE spawning the keeper. The resolved command (a non-empty `string[]` whose `[0]` is the absolute executable path and `[1..]` are leading argv such as `["node", "/abs/path/cli.js"]`) SHALL be forwarded to the keeper subprocess via the env var `PI_KEEPER_PI_CMD`, JSON-encoded.

When resolution fails (`resolvePiCommand()` returns null), the server SHALL NOT spawn the keeper. It SHALL return a `PI_NOT_FOUND` spawn result identical to the non-keeper headless branch.

The keeper SHALL strip `PI_KEEPER_PI_CMD` from the env it passes to pi (matching the existing handling of `PI_KEEPER_PI_ARGS`).

#### Scenario: Server resolves and forwards bundled pi (Electron launch)
- **WHEN** the dashboard server is launched from `/Applications/PI-Dashboard.app/Contents/Resources/server/` and spawns a headless RPC session
- **THEN** the server SHALL call `resolvePiCommand()` and receive an argv pointing inside `Resources/server/node_modules/`
- **AND** the server SHALL set `PI_KEEPER_PI_CMD=<JSON-encoded argv>` in the keeper's env
- **AND** the keeper SHALL spawn pi using that absolute path
- **AND** pi SHALL start successfully without relying on PATH lookup

#### Scenario: Resolver miss fails fast before keeper spawn
- **WHEN** `resolvePiCommand()` returns null at keeper-spawn time
- **THEN** the server SHALL return `{ success: false, code: "PI_NOT_FOUND", message: <message including checked locations> }`
- **AND** the keeper subprocess SHALL NOT be spawned
- **AND** no `keeper-<sessionId>.log` SHALL be created for that spawn attempt

#### Scenario: PI_KEEPER_PI_CMD stripped from pi env
- **WHEN** the keeper spawns pi with `PI_KEEPER_PI_CMD` set in its own env
- **THEN** the env passed to pi SHALL NOT contain `PI_KEEPER_PI_CMD`
- **AND** the env passed to pi SHALL NOT contain `PI_KEEPER_PI_ARGS`

### Requirement: Keeper uses resolved pi command when env var is set

The keeper SHALL, when `PI_KEEPER_PI_CMD` is set and parses to a non-empty JSON `string[]`, invoke `child_process.spawn(cmd[0], [...cmd.slice(1), ...piArgs], …)` instead of `child_process.spawn("pi", piArgs, …)`. The keeper's spawn log SHALL include the resolved executable path so resume failures can be diagnosed.

When `PI_KEEPER_PI_CMD` is unset, missing, empty, or malformed JSON, the keeper SHALL fall back to `child_process.spawn("pi", piArgs, …)` (bare PATH lookup). Malformed input SHALL be logged as `keeper: ignoring malformed PI_KEEPER_PI_CMD` and treated as unset.

#### Scenario: Keeper spawns absolute pi when env var present
- **WHEN** the keeper starts with `PI_KEEPER_PI_CMD=["/abs/path/pi"]`
- **THEN** the keeper SHALL invoke `child_process.spawn("/abs/path/pi", piArgs, …)`
- **AND** the keeper log SHALL record `spawning pi /abs/path/pi <args>`

#### Scenario: Keeper handles node+script form on Windows
- **WHEN** the keeper starts with `PI_KEEPER_PI_CMD=["node","C:\\path\\cli.js"]` and `piArgs=["--mode","rpc"]`
- **THEN** the keeper SHALL invoke `child_process.spawn("node", ["C:\\path\\cli.js","--mode","rpc"], …)`

#### Scenario: Bare pi fallback preserved for manual invocation
- **WHEN** the keeper is invoked directly (no `PI_KEEPER_PI_CMD` in env)
- **THEN** the keeper SHALL invoke `child_process.spawn("pi", piArgs, …)`
- **AND** the keeper SHALL NOT log any malformed-env-var warning

#### Scenario: Malformed env var falls back without crashing
- **WHEN** the keeper starts with `PI_KEEPER_PI_CMD="not json"` (or `[]`, or `{"foo":1}`)
- **THEN** the keeper SHALL log `keeper: ignoring malformed PI_KEEPER_PI_CMD`
- **AND** the keeper SHALL invoke `child_process.spawn("pi", piArgs, …)`
- **AND** the keeper SHALL NOT exit before the pi spawn attempt
