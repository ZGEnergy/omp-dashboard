## ADDED Requirements

### Requirement: Bridge dispatch_extension_command message
The bridge extension SHALL emit a new server-bound WebSocket message `{type: "dispatch_extension_command", sessionId, command, requestId}` when ALL of the following are true:

- The text being processed is a registered extension slash command (per `isExtensionSlashCommand(text, pi.getCommands())`).
- `pi.dispatchCommand` is NOT a function on the active pi build (per `hasDispatchCommand(pi)`).
- The bridge is running inside a headless RPC pi session (per the headless detection probe — see Requirement "Bridge headless detection").

The bridge SHALL emit this message INSTEAD OF the existing stopgap `command_feedback {status: "error", message: "requires pi 0.71+"}` for this scenario. The bridge SHALL still emit `command_feedback {status: "started"}` as today; the terminal event (`completed` / `error`) SHALL come from the server, not the bridge.

The `requestId` SHALL be a UUID minted by the bridge for correlation. The server MAY include it as the `id` field of the pi RPC line so pi's RPC response (if any) can be correlated.

#### Scenario: Bridge emits dispatch_extension_command in headless RPC session
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is NOT a function AND the bridge detects a headless RPC pi
- **THEN** the bridge SHALL emit `command_feedback {command: "/ctx-stats", status: "started"}`
- **AND** the bridge SHALL emit `dispatch_extension_command {sessionId, command: "/ctx-stats", requestId: <uuid>}` to the server
- **AND** the bridge SHALL NOT emit `command_feedback {status: "error"}` for this text
- **AND** the bridge SHALL NOT call `pi.sendUserMessage(...)`

#### Scenario: Bridge falls back to stopgap for non-headless session
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is NOT a function AND the bridge does NOT detect a headless RPC pi (e.g. tmux session)
- **THEN** the bridge SHALL emit the existing stopgap `command_feedback {status: "started"}` followed by `{status: "error", message: <pi version requirement>}`
- **AND** the bridge SHALL NOT emit `dispatch_extension_command`

#### Scenario: Bridge skips dispatch_extension_command when dispatchCommand exists
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` IS a function
- **THEN** the bridge SHALL call `pi.dispatchCommand("/ctx-stats", {streamingBehavior: "followUp"})` directly
- **AND** the bridge SHALL emit `command_feedback {status: "completed"}` after dispatch resolves
- **AND** the bridge SHALL NOT emit `dispatch_extension_command`


### Requirement: Bridge headless detection
The bridge SHALL detect whether it is running in a headless RPC pi session by combining two probes:

1. `process.env.PI_DASHBOARD_SPAWNED === "1"` (set by `process-manager.ts::buildSpawnEnv` for every dashboard-spawned session)
2. `process.argv` contains `--mode` followed by `rpc`

Both MUST be true for the detection to return `true`. Either alone is insufficient — `PI_DASHBOARD_SPAWNED=1` alone matches dashboard-spawned tmux sessions; `--mode rpc` alone matches non-dashboard RPC invocations.

The detection SHALL be a pure function `isHeadlessRpcSession(): boolean` exported from `bridge-context.ts`, suitable for unit testing without a pi instance.

#### Scenario: Detects dashboard-spawned headless pi
- **GIVEN** `process.env.PI_DASHBOARD_SPAWNED === "1"` AND `process.argv` contains `["--mode", "rpc"]`
- **WHEN** `isHeadlessRpcSession()` is called
- **THEN** SHALL return `true`

#### Scenario: Rejects dashboard-spawned tmux session
- **GIVEN** `process.env.PI_DASHBOARD_SPAWNED === "1"` AND `process.argv` does NOT contain `--mode rpc`
- **WHEN** `isHeadlessRpcSession()` is called
- **THEN** SHALL return `false`

#### Scenario: Rejects non-dashboard RPC pi
- **GIVEN** `process.env.PI_DASHBOARD_SPAWNED` is unset AND `process.argv` contains `["--mode", "rpc"]`
- **WHEN** `isHeadlessRpcSession()` is called
- **THEN** SHALL return `false`


### Requirement: Server-side dispatch routing to keeper
The dashboard server SHALL register a handler for the `dispatch_extension_command` bridge → server message. The handler SHALL:

1. Look up the session's keeper-manager entry (created during `spawnHeadless` or rediscovered on server restart).
2. Connect to the keeper's UDS / named pipe (with up-to-3-attempt exponential backoff for keeper-not-yet-ready races).
3. Write `{"type":"prompt","message":"<command>","id":"<requestId>"}\n` to the socket.
4. Close the connection (one connection per dispatch).
5. On successful write: emit `command_feedback {sessionId, command, status: "completed"}` to all browser subscribers of that session — **optimistic completion**. Pi's actual RPC dispatch result arrives via bridge WS; if pi rejects the line, an `extension_error` event from pi flows over the bridge and is rendered as a chat error row separately.
6. On any failure (no keeper for this session, connect retries exhausted, write error): emit `command_feedback {sessionId, command, status: "error", message: <human-readable reason>}` to browser subscribers.

The handler SHALL NOT block the WS read loop. It SHALL run async with internal error handling.

#### Scenario: Server dispatches to keeper successfully
- **WHEN** the server receives `dispatch_extension_command {sessionId: "abc", command: "/ctx-stats", requestId: "r1"}` from the bridge AND a keeper exists for session `abc`
- **THEN** the server SHALL connect to the keeper's UDS / named pipe
- **AND** SHALL write `{"type":"prompt","message":"/ctx-stats","id":"r1"}\n` to the socket
- **AND** SHALL emit `command_feedback {sessionId: "abc", command: "/ctx-stats", status: "completed"}` to browser subscribers
- **AND** SHALL close the socket connection

#### Scenario: Server cannot find keeper for session
- **WHEN** the server receives `dispatch_extension_command {sessionId: "abc", ...}` AND no keeper exists for session `abc`
- **THEN** the server SHALL emit `command_feedback {sessionId: "abc", command, status: "error", message: <reason citing keeper unavailable>}` to browser subscribers
- **AND** the server SHALL NOT crash

#### Scenario: Keeper write fails (broken pipe)
- **WHEN** the server receives `dispatch_extension_command` AND the keeper's UDS write fails (e.g. EPIPE, ECONNREFUSED)
- **THEN** the server SHALL retry the connect-and-write up to 3 times with exponential backoff
- **AND** if all retries fail, SHALL emit `command_feedback {status: "error", message: <reason>}` to browser subscribers


### Requirement: Optimistic completion semantic
The server's `command_feedback {status: "completed"}` emission for the dispatch_extension_command path SHALL be **optimistic** — it indicates the pi RPC line was successfully written to the keeper, not that pi's handler ran successfully. If pi rejects the dispatch (handler throws, command not found, etc.), pi emits `extension_error` events that flow back over the bridge WS and are rendered as separate chat error rows by the existing event-reducer.

The client reducer's started→terminal upsert (introduced by `fix-extension-slash-commands-in-dashboard`) SHALL apply normally: the "in progress" badge transitions to "completed" on optimistic success, and the user sees a separate `extension_error` row if pi rejected.

#### Scenario: Pi accepts dispatch (handler runs)
- **WHEN** the server emits optimistic `completed` AND pi's handler runs successfully
- **THEN** the chat row SHALL transition from "in progress" to "completed"
- **AND** the handler's events (e.g. `ctx.ui.notify`) SHALL render normally via the bridge WS path

#### Scenario: Pi rejects dispatch (handler throws)
- **WHEN** the server emits optimistic `completed` AND pi's handler throws
- **THEN** the chat row SHALL still transition to "completed" (optimistic)
- **AND** pi's `extension_error` event SHALL render as a separate chat error row below the completed row
- **AND** the user SHALL see both: "/ctx-stats completed" + "Extension error: <pi message>"
