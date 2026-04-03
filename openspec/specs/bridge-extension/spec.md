## ADDED Requirements

### Requirement: Dev build and server shutdown on reload cleanup
When `devBuildOnReload` is `true` in the loaded config, the bridge extension's cleanup function (called on `/reload`) SHALL perform the following before the normal cleanup:

1. Log `🔨 Dashboard: building client...` to the terminal
2. Run `execSync("npm run build", { cwd: <packageRoot>, stdio: "inherit" })` where packageRoot is resolved from `__dirname` (two levels up from `src/extension/`)
3. Log `✅ Dashboard: client built` on success, or log the error on failure
4. Log `🛑 Dashboard: stopping server...` to the terminal
5. Send `POST http://localhost:{port}/api/shutdown` (fire-and-forget)
6. Log `✅ Dashboard: server stopped`

Build or shutdown failures SHALL be caught and logged but SHALL NOT prevent the reload from completing.

#### Scenario: Cleanup with devBuildOnReload enabled
- **WHEN** `/reload` triggers the cleanup function and `config.devBuildOnReload` is `true`
- **THEN** the cleanup SHALL build the client and request server shutdown before disconnecting

#### Scenario: Cleanup with devBuildOnReload disabled
- **WHEN** `/reload` triggers the cleanup function and `config.devBuildOnReload` is `false`
- **THEN** the cleanup SHALL proceed normally without building or shutting down the server

#### Scenario: Build error is non-fatal
- **WHEN** `execSync("npm run build")` throws an error during cleanup
- **THEN** the error SHALL be logged and cleanup SHALL continue with the shutdown request

### Requirement: Retry port probe after failed server launch
When `launchServer` returns a failure result during the auto-start flow in `session_start`, the bridge extension SHALL re-probe the port using `isPortOpen(config.piPort)` before deciding whether to show a warning notification. If the re-probe returns `true` (port is now open), the bridge SHALL suppress the failure warning — another agent started the server concurrently. If the re-probe returns `false` (port is still closed), the bridge SHALL show the warning notification with the failure message.

#### Scenario: Concurrent launch — another agent started the server
- **WHEN** `launchServer` fails and the subsequent `isPortOpen` re-probe returns `true`
- **THEN** no warning notification SHALL be shown

#### Scenario: Genuine server failure
- **WHEN** `launchServer` fails and the subsequent `isPortOpen` re-probe returns `false`
- **THEN** the bridge SHALL show a warning notification with the failure message

#### Scenario: Single agent — successful launch
- **WHEN** `launchServer` succeeds on the first attempt
- **THEN** the bridge SHALL show the success notification as before (no behavioral change)

### Requirement: Command routing in send_prompt handler
The bridge extension's command handler SHALL parse `send_prompt` text for `!`, `!!`, and `/` prefixes and route them to the appropriate pi APIs instead of always calling `sendUserMessage()`.

Routing order:
1. `!!<cmd>` → silent bash via `pi.exec()`, forward `bash_output` event
2. `!<cmd>` → bash via `pi.exec()`, forward `bash_output` event + send to LLM
3. `/compact [args]` → `ctx.compact()` with optional custom instructions
4. `/` prefixed → `session.prompt(text)` for extension commands, skills, templates
5. Default → `pi.sendUserMessage(text)`

#### Scenario: Bang command routed to exec
- **WHEN** `send_prompt` arrives with text `!npm test`
- **THEN** the handler SHALL call `pi.exec()` with the command, NOT `sendUserMessage()`

#### Scenario: Compact routed to ctx.compact
- **WHEN** `send_prompt` arrives with text `/compact`
- **THEN** the handler SHALL call `ctx.compact()`, NOT `sendUserMessage()`

#### Scenario: Regular text unchanged
- **WHEN** `send_prompt` arrives with text `explain this function`
- **THEN** the handler SHALL call `sendUserMessage("explain this function")` as before

### Requirement: Hidden command registration
The bridge SHALL register a `__dashboard` command via `pi.registerCommand()` during `initBridge()`. The command SHALL have no description. The commands list sent to the server SHALL filter out commands whose names start with `__`.

#### Scenario: Dashboard command registered
- **WHEN** the bridge initializes
- **THEN** `pi.registerCommand("__dashboard", ...)` SHALL be called

#### Scenario: Hidden commands filtered from list
- **WHEN** the bridge sends a `commands_list` message
- **THEN** commands with names starting with `__` SHALL be excluded

### Requirement: Cached session for prompt routing
The bridge SHALL store a reference to the agent session (from `cachedCtx`) that exposes `prompt()` for routing slash commands. The command handler SHALL receive this reference via its options/dependencies.

#### Scenario: Session reference passed to handler
- **WHEN** a slash command needs routing via `session.prompt()`
- **THEN** the command handler SHALL have access to the session's `prompt()` method through its stored context reference
## ADDED Requirements

### Requirement: UI proxy activation on session start
The bridge extension SHALL activate the UI proxy in the `session_start` handler. The proxy SHALL wrap `ctx.ui.confirm`, `ctx.ui.select`, `ctx.ui.input`, `ctx.ui.editor`, and `ctx.ui.notify` with dashboard-forwarding versions. The proxy SHALL receive the WebSocket connection, session ID getter, and `ctx.hasUI` flag.

#### Scenario: Proxy activated on session start
- **WHEN** the bridge's `session_start` handler fires
- **THEN** the UI proxy SHALL be applied to `ctx.ui`, replacing dialog and notify methods

#### Scenario: Proxy receives response messages
- **WHEN** the bridge's `onMessage` handler receives an `extension_ui_response` message
- **THEN** it SHALL forward the message to the UI proxy for promise resolution

### Requirement: UI proxy handles reconnection
When the bridge reconnects to the dashboard server, the UI proxy's pending requests are NOT replayed (they are tied to the original dialog call which may have already resolved or timed out). The proxy SHALL continue to work with the new connection for future dialog calls.

#### Scenario: Reconnection does not replay pending requests
- **WHEN** the bridge reconnects to the dashboard server
- **THEN** existing pending requests in the UI proxy SHALL remain in their current state (resolved by TUI or timed out)

### Requirement: Bridge registers ask_user tool
The bridge extension SHALL register an `ask_user` tool via `pi.registerTool()` during `initBridge()`. The tool SHALL have the same parameters, description, promptSnippet, and promptGuidelines as the current `.pi/extensions/ask-user.ts`. The tool's `execute` method SHALL call `ctx.ui.confirm`, `ctx.ui.select`, `ctx.ui.input`, or `ctx.ui.multiselect` based on the `method` parameter — which are already proxied by the UI proxy to the dashboard.

#### Scenario: ask_user tool registered on init
- **WHEN** `initBridge(pi)` runs
- **THEN** `pi.registerTool()` SHALL be called with `name: "ask_user"`

#### Scenario: ask_user confirm call
- **WHEN** the LLM calls `ask_user` with `method: "confirm"` and `title: "Proceed?"`
- **THEN** the tool SHALL call `ctx.ui.confirm("Proceed?", message)` and return the result

#### Scenario: ask_user select call
- **WHEN** the LLM calls `ask_user` with `method: "select"`, `title: "Pick one"`, and `options: ["A", "B"]`
- **THEN** the tool SHALL call `ctx.ui.select("Pick one", ["A", "B"])` and return the result

### Requirement: Dashboard-spawned sessions override existing ask_user
When `PI_DASHBOARD_SPAWNED` environment variable is set to `"1"`, the bridge SHALL always register the `ask_user` tool, overriding any existing tool with the same name. The dashboard is the primary UI for these sessions and must control the ask_user flow.

#### Scenario: Dashboard-spawned overrides existing tool
- **WHEN** `PI_DASHBOARD_SPAWNED=1` and another extension already registered `ask_user`
- **THEN** the bridge SHALL register `ask_user` anyway, overriding the existing registration

#### Scenario: Dashboard-spawned with no existing tool
- **WHEN** `PI_DASHBOARD_SPAWNED=1` and no `ask_user` tool exists
- **THEN** the bridge SHALL register `ask_user` normally

### Requirement: User-launched sessions respect existing ask_user
When `PI_DASHBOARD_SPAWNED` is not set, the bridge SHALL check `pi.getAllTools()` for an existing `ask_user` tool before registering. If one already exists, the bridge SHALL skip registration to respect the user's custom implementation.

#### Scenario: User-launched with existing custom ask_user
- **WHEN** `PI_DASHBOARD_SPAWNED` is not set and `pi.getAllTools()` contains a tool named `ask_user`
- **THEN** the bridge SHALL NOT register `ask_user`

#### Scenario: User-launched with no existing tool
- **WHEN** `PI_DASHBOARD_SPAWNED` is not set and no `ask_user` tool exists in `pi.getAllTools()`
- **THEN** the bridge SHALL register `ask_user`

### Requirement: Standalone ask_user extension removed
The standalone `.pi/extensions/ask-user.ts` file SHALL be removed from the project. The `ask_user` tool is now provided by the bridge extension.

#### Scenario: File removed
- **WHEN** the project is built
- **THEN** `.pi/extensions/ask-user.ts` SHALL NOT exist
## ADDED Requirements

### Requirement: Bridge listens to flow events on pi.events
The bridge extension SHALL register listeners on `pi.events` for all `flow:*` event names and forward them as `event_forward` messages using the mapped `eventType` values defined in the flow-event-bridge spec.

#### Scenario: Flow event listeners registered at activation
- **WHEN** the bridge extension activates and `pi.events` is available
- **THEN** listeners SHALL be registered for `flow:flow-started`, `flow:agent-started`, `flow:agent-complete`, `flow:subagent-tool-call`, `flow:subagent-tool-result`, `flow:assistant-text`, `flow:thinking-text`, `flow:loop-iteration`, `flow:auto-decision`, `flow:complete`

#### Scenario: pi.events not available
- **WHEN** `pi.events` is not available (pi-flows not installed)
- **THEN** the bridge SHALL continue to function normally without flow event forwarding

### Requirement: Bridge handles flow_control messages from server
The bridge SHALL handle incoming `flow_control` messages from the server. For `action: "abort"`, it SHALL call the existing abort mechanism. For `action: "toggle_autonomous"`, it SHALL emit a `flow:toggle-autonomous` event on `pi.events` or call the pi-flows autonomous mode API.

#### Scenario: Abort flow control received
- **WHEN** the bridge receives `{ type: "flow_control", action: "abort" }`
- **THEN** the bridge SHALL emit `flow:abort` on `pi.events` (pi-flows listens for this and calls `flowManager.abort()`)

#### Scenario: Toggle autonomous control received
- **WHEN** the bridge receives `{ type: "flow_control", action: "toggle_autonomous" }`
- **THEN** the bridge SHALL emit `flow:toggle-autonomous` on `pi.events` (pi-flows listens for this and toggles `setAutonomousMode`)

### Requirement: Heartbeat acknowledgment handling
The bridge extension SHALL treat incoming `heartbeat_ack` messages as server liveness signals. These messages SHALL be processed by the `ConnectionManager`'s `onMessage` handler, which updates the `lastMessageAt` timestamp used by the watchdog timer.

#### Scenario: Heartbeat ack received
- **WHEN** the bridge receives a `{ type: "heartbeat_ack" }` message from the server
- **THEN** the `ConnectionManager`'s `lastMessageAt` timestamp SHALL be updated
- **AND** no further processing SHALL be required (the ack is consumed by the connection layer)

#### Scenario: Heartbeat sent triggers ack
- **WHEN** the bridge sends a `session_heartbeat` to the server
- **THEN** the server SHALL respond with `heartbeat_ack`
- **AND** the bridge SHALL receive it within the normal WebSocket delivery time
