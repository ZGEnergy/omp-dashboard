## ADDED Requirements

### Requirement: Extension lifecycle and server connection
The bridge extension SHALL be a global pi extension installed at `~/.pi/agent/extensions/` (via pi package). On `session_start`, it SHALL read configuration from the shared config module to determine the WebSocket port. If `PI_DASHBOARD_URL` env var is set, it SHALL use that instead. It SHALL then check whether the server is running and optionally auto-start it before connecting. On `session_shutdown`, it SHALL send `session_unregister` and close the connection.

The bridge extension SHALL use `ctx.sessionManager.getSessionId()` as the session ID instead of generating a random UUID. The session ID SHALL be stored as a mutable variable (`let`) to support session switches.

The ConnectionManager SHALL never throw unhandled exceptions that could crash the host pi process. All WebSocket operations (construction, send, close) SHALL be wrapped in error handling that falls back to buffering and/or reconnection.

#### Scenario: Successful connection on session start
- **WHEN** pi session starts and the bridge extension loads
- **THEN** the extension SHALL read `piPort` from `~/.pi/dashboard/config.json`, set `sessionId` from `ctx.sessionManager.getSessionId()`, connect to `ws://localhost:{piPort}`, and send a `session_register` message with session metadata including `sessionFile` and `sessionDir`

#### Scenario: PI_DASHBOARD_URL override
- **WHEN** the `PI_DASHBOARD_URL` environment variable is set
- **THEN** the extension SHALL use that URL instead of building one from the config file

#### Scenario: Dashboard server not running with autoStart enabled
- **WHEN** the bridge extension detects the server is not running (TCP probe on `piPort` fails) and `autoStart` is `true` in config
- **THEN** it SHALL spawn the dashboard server as a detached process, resolving the CLI script path relative to the extension's own location, and then connect with the normal retry loop

#### Scenario: Dashboard server not running with autoStart disabled
- **WHEN** the bridge extension detects the server is not running and `autoStart` is `false` in config
- **THEN** it SHALL NOT spawn the server and SHALL silently retry connection with exponential backoff

#### Scenario: Server auto-started successfully
- **WHEN** the extension spawns the dashboard server and it starts listening
- **THEN** the extension SHALL notify the user via `ctx.ui.notify()` with message `🌐 Dashboard started at http://localhost:{port}` using the `info` level

#### Scenario: Server already running
- **WHEN** the TCP probe on `piPort` succeeds (port is open)
- **THEN** the extension SHALL connect directly without spawning and SHALL NOT show any notification

#### Scenario: Multiple pi sessions start simultaneously
- **WHEN** multiple pi sessions start at the same time and all detect the server is not running
- **THEN** each SHALL attempt to spawn the server independently; duplicate spawn attempts SHALL fail harmlessly (EADDRINUSE), and the retry loop SHALL connect to whichever instance succeeded

#### Scenario: Session shutdown
- **WHEN** pi session shuts down
- **THEN** the extension SHALL send `session_unregister` and close the WebSocket

#### Scenario: Server dies while extension is sending
- **WHEN** the dashboard server process dies and `WebSocket.send()` throws
- **THEN** the ConnectionManager SHALL catch the exception, buffer the message, and schedule reconnection

#### Scenario: WebSocket constructor fails
- **WHEN** `new WebSocket(url)` throws during a reconnection attempt
- **THEN** the ConnectionManager SHALL catch the exception and schedule another reconnect with exponential backoff

#### Scenario: Server restart cycle
- **WHEN** the dashboard server is killed and restarted
- **THEN** the bridge extension SHALL reconnect automatically and re-sync full session state without any impact on the pi agent

#### Scenario: Session switch to new session
- **WHEN** pi fires `session_switch` with reason `"new"` or `"resume"`
- **THEN** the bridge SHALL send `session_unregister` for the old session ID, update its internal `sessionId` from `ctx.sessionManager.getSessionId()`, read new `sessionFile` and `sessionDir`, send `session_register` with the new ID and file info, and perform a full state sync

#### Scenario: Session fork
- **WHEN** pi fires `session_fork` (triggered by `/fork`)
- **THEN** the bridge SHALL perform the same unregister/register flow as `session_switch`: unregister old ID, update `sessionId`, `sessionFile`, `sessionDir` from ctx, register new ID, full state sync

#### Scenario: Events after session switch or fork
- **WHEN** events fire after a `session_switch` or `session_fork`
- **THEN** all forwarded events SHALL use the updated session ID

### Requirement: Session source detection
The bridge extension SHALL detect the source environment where pi is running and include it in the `session_register` message.

Detection logic:
- If `PI_DASHBOARD_SPAWNED` env var is set → `tmux`
- If `ZED_TERM` env var is set → `zed`
- If `TMUX` env var is set → `tmux`
- Otherwise → `tui`

#### Scenario: Pi running in Zed editor
- **WHEN** pi starts with `ZED_TERM` environment variable set
- **THEN** the extension SHALL report source as `zed`

#### Scenario: Pi spawned by dashboard
- **WHEN** pi starts with `PI_DASHBOARD_SPAWNED` environment variable set
- **THEN** the extension SHALL report source as `tmux`

#### Scenario: Pi running in plain terminal
- **WHEN** pi starts without any recognized environment variables
- **THEN** the extension SHALL report source as `tui`

### Requirement: Event forwarding
The bridge extension SHALL subscribe to all pi events and forward them to the dashboard server. Every forwarded event SHALL include the `piSessionId` from `ctx.sessionManager`.

Events to forward:
- `message_start`, `message_update`, `message_end`
- `tool_execution_start`, `tool_execution_update`, `tool_execution_end`
- `agent_start`, `agent_end`
- `turn_start`, `turn_end`
- `model_select`
- `session_compact`
- `auto_retry_start`, `auto_retry_end`
- `tool_call` (only when blocked, to capture extension UI interactions)

#### Scenario: Assistant streaming text
- **WHEN** pi fires a `message_update` event with `text_delta`
- **THEN** the extension SHALL forward it to the dashboard server within the same event loop tick

#### Scenario: Tool execution lifecycle
- **WHEN** pi fires `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` for a tool call
- **THEN** the extension SHALL forward all three events in order with the same `toolCallId`

#### Scenario: WebSocket disconnected during event
- **WHEN** an event fires while the WebSocket is disconnected
- **THEN** the extension SHALL buffer events (up to 1000) and flush them on reconnect

### Requirement: State sync on connect and reconnect
On initial connection or reconnection to the dashboard server, the bridge extension SHALL send the full session state so the dashboard can reconstruct the conversation.

State sync SHALL include:
- Session metadata (cwd, source, model, thinkingLevel, sessionName)
- All entries from `ctx.sessionManager.getBranch()` converted to protocol events
- Current accumulated token/cost stats from session entries
- Available commands from `pi.getCommands()`

#### Scenario: Reconnection after server restart
- **WHEN** the dashboard server restarts and the extension reconnects
- **THEN** the extension SHALL send a full `session_register` with all branch entries so the server can rebuild the session

#### Scenario: Large session state sync
- **WHEN** the session has more than 500 entries
- **THEN** the extension SHALL send state sync in chunks (100 entries per message) to avoid WebSocket frame size limits

### Requirement: Command relay from dashboard
The bridge extension SHALL listen for commands from the dashboard server and execute them in the pi session.

Supported commands:
- `send_prompt`: If text only, call `pi.sendUserMessage(text)`. If images are present, call `pi.sendUserMessage([{ type: "text", text }, ...images])`. If agent is streaming, use `{ deliverAs: "followUp" }`.
- `abort`: call `ctx.abort()`
- `request_commands`: send updated `commands_list` response
- `request_state_sync`: re-send full session state
- `list_files`: run `fd` in session cwd and return `files_list` response

#### Scenario: User sends prompt from dashboard while agent is idle
- **WHEN** the extension receives `send_prompt` and `ctx.isIdle()` returns true
- **THEN** the extension SHALL call `pi.sendUserMessage(text)` without deliverAs option

#### Scenario: User sends prompt from dashboard while agent is streaming
- **WHEN** the extension receives `send_prompt` and agent is streaming
- **THEN** the extension SHALL call `pi.sendUserMessage(text, { deliverAs: "followUp" })`

#### Scenario: User sends prompt with images
- **WHEN** the extension receives `send_prompt` with text and images array
- **THEN** the extension SHALL call `pi.sendUserMessage([{ type: "text", text: msg.text }, ...msg.images])`

#### Scenario: User aborts from dashboard
- **WHEN** the extension receives `abort`
- **THEN** the extension SHALL call `ctx.abort()` to stop the current agent operation

### Requirement: File listing via fd
The bridge extension SHALL handle `list_files` requests by spawning `fd` in the session's working directory and returning matching file paths as a `files_list` response.

The `fd` command SHALL be invoked with arguments: `--base-directory <cwd> --max-results 20 --type f --type d --full-path --hidden --exclude .git`. The query SHALL be passed as a regex pattern with special characters escaped.

#### Scenario: File search with query
- **WHEN** the extension receives `list_files` with query `db.t`
- **THEN** the extension SHALL spawn `fd` with the escaped query pattern and return matching paths as `files_list`

#### Scenario: File search with empty query
- **WHEN** the extension receives `list_files` with an empty query
- **THEN** the extension SHALL spawn `fd` without a pattern and return up to 20 files/directories

#### Scenario: fd not installed
- **WHEN** the extension receives `list_files` but `fd` is not available on the system
- **THEN** the extension SHALL return an empty `files_list` response (graceful degradation)

#### Scenario: fd returns no results
- **WHEN** `fd` finds no matching files for the query
- **THEN** the extension SHALL return a `files_list` with an empty files array

#### Scenario: Query contains regex special characters
- **WHEN** the extension receives `list_files` with query `file(1).ts`
- **THEN** the extension SHALL escape regex special characters before passing to `fd`

### Requirement: Command list for autocomplete
The bridge extension SHALL send the list of available commands to the dashboard server on connect and whenever commands change (e.g., after `/reload`).

The command list SHALL be obtained from `pi.getCommands()` and include name, description, source, and path.

#### Scenario: Commands sent on connect
- **WHEN** the extension connects to the dashboard server
- **THEN** it SHALL send a `commands_list` message with all available commands

#### Scenario: Commands updated after reload
- **WHEN** the pi session is reloaded (extension receives `session_start` again after reload)
- **THEN** the extension SHALL send an updated `commands_list` message

### Requirement: Stats tracking
The bridge extension SHALL extract token usage and cost from `turn_end` events by reading `event.message.usage` and send `stats_update` messages to the dashboard server. Each `stats_update` SHALL include per-turn token counts and cost, and when available, per-turn usage breakdown and context window usage.

On `turn_end`, the bridge SHALL:
1. Check if `event.message.usage` exists; if not, skip sending stats
2. Extract per-turn values: `usage.input` → tokensIn, `usage.output` → tokensOut, `usage.cost.total` → cost
3. Extract per-turn breakdown: `{ input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite }`
4. Call `ctx.getContextUsage()` for current context window state
5. Send a `stats_update` with per-turn values, `turnUsage`, and `contextUsage`

Stats SHALL include: tokensIn, tokensOut, cost (per-turn), turnUsage (per-turn breakdown), contextUsage (current window).

#### Scenario: Stats update after turn
- **WHEN** a `turn_end` event fires with `event.message.usage` containing `{ input: 1500, output: 300, cacheRead: 800, cacheWrite: 200, cost: { total: 0.004 } }`
- **THEN** the extension SHALL send a `stats_update` with `tokensIn: 1500`, `tokensOut: 300`, `cost: 0.004`, `turnUsage: { input: 1500, output: 300, cacheRead: 800, cacheWrite: 200 }`, and context window state from `ctx.getContextUsage()`

#### Scenario: Turn end without usage data
- **WHEN** a `turn_end` event fires but `event.message.usage` is undefined
- **THEN** the extension SHALL NOT send a `stats_update` message

#### Scenario: Context usage unavailable
- **WHEN** `ctx.getContextUsage()` returns undefined
- **THEN** the extension SHALL omit `contextUsage` from the `stats_update` message

### Requirement: Heartbeat
The bridge extension SHALL send a `session_heartbeat` message every 15 seconds to indicate liveness. The dashboard server SHALL mark sessions as disconnected if no heartbeat is received for 45 seconds.

#### Scenario: Heartbeat during idle session
- **WHEN** the pi session is idle with no events for 30 seconds
- **THEN** the extension SHALL still send heartbeats every 15 seconds

#### Scenario: Server detects disconnection
- **WHEN** no heartbeat is received from an extension for 45 seconds
- **THEN** the dashboard server SHALL mark the session status as `ended`

### Requirement: TCP port probe
The bridge extension SHALL probe `localhost:{piPort}` via a TCP connection attempt to detect whether the dashboard server is running. The probe SHALL have a timeout of 1 second.

#### Scenario: Server is running
- **WHEN** a TCP connection to `localhost:{piPort}` succeeds within 1 second
- **THEN** the probe SHALL return `true` and the connection SHALL be immediately closed

#### Scenario: Server is not running
- **WHEN** a TCP connection to `localhost:{piPort}` is refused or times out
- **THEN** the probe SHALL return `false`

### Requirement: Server process spawning
The bridge extension SHALL spawn the dashboard server using `child_process.spawn()` with `detached: true` and `stdio: 'ignore'`, followed by `unref()`. The server CLI path SHALL be resolved relative to the extension's own file location. The spawn command SHALL pass `--port {port} --pi-port {piPort}` from the loaded config.

#### Scenario: Spawn with configured ports
- **WHEN** config has `port: 3000` and `piPort: 4000`
- **THEN** the extension SHALL spawn the server with `--port 3000 --pi-port 4000`

#### Scenario: Spawned process outlives pi session
- **WHEN** the pi session exits after spawning the server
- **THEN** the dashboard server process SHALL continue running independently

#### Scenario: Spawn failure detection
- **WHEN** the spawned server process exits within 2 seconds of being spawned
- **THEN** the extension SHALL show a warning via `ctx.ui.notify()` with message `Dashboard server failed to start` at `warning` level

### Requirement: OpenSpec polling
The bridge extension SHALL poll `openspec list --json` and `openspec status --change <name> --json` for each change every 30 seconds. It SHALL send an `openspec_update` message when data changes.

#### Scenario: Poll on session start
- **WHEN** the session starts
- **THEN** the extension runs openspec CLI and sends an initial `openspec_update`

#### Scenario: Periodic poll with changes
- **WHEN** 30 seconds elapse and openspec data has changed
- **THEN** the extension sends an `openspec_update` with the new data

#### Scenario: Periodic poll without changes
- **WHEN** 30 seconds elapse but openspec data is unchanged
- **THEN** no message is sent

### Requirement: OpenSpec refresh handling
The bridge extension SHALL handle `openspec_refresh` messages by immediately running the CLI, updating the internal `lastOpenSpecJson` cache, and sending `openspec_update` via `sendOpenSpecNow`. The command handler SHALL NOT return an `openspec_update` directly — the bridge's `onMessage` callback SHALL handle it to ensure cache consistency.

#### Scenario: Refresh request
- **WHEN** the extension receives an `openspec_refresh` message
- **THEN** it runs the openspec CLI immediately via `sendOpenSpecNow`, updates the cache, and sends `openspec_update`

#### Scenario: Refresh does not cause duplicate sends
- **WHEN** the extension receives `openspec_refresh` and the data is unchanged from the last poll
- **THEN** only one `openspec_update` SHALL be sent (from `sendOpenSpecNow`), and the next poll cycle SHALL not re-send the same data

### Requirement: OpenSpec state sync on reconnect
The bridge extension SHALL include OpenSpec data in the `sendStateSync` flow when reconnecting to the dashboard server. This ensures the server always has current OpenSpec state after a reconnect.

#### Scenario: Reconnect sends OpenSpec data
- **WHEN** the bridge extension reconnects to the dashboard server
- **THEN** it SHALL call `sendOpenSpecNow` to send the current OpenSpec state, regardless of whether it has changed since the last send

### Requirement: Graceful CLI failure
The extension SHALL handle openspec CLI failures gracefully without crashing.

#### Scenario: CLI not found
- **WHEN** `openspec` is not installed
- **THEN** the extension sends `openspec_update` with `{ initialized: false, changes: [] }`

#### Scenario: Project not initialized
- **WHEN** `openspec list --json` returns an error (no openspec dir)
- **THEN** the extension sends `openspec_update` with `{ initialized: false, changes: [] }`

### Requirement: Send available models on session start
The bridge extension SHALL read available models from `ctx.modelRegistry.getAvailable()` on session_start and send a `models_list` message.

#### Scenario: Models sent on start
- **WHEN** the session starts
- **THEN** the extension sends `models_list` with all models that have configured API keys

### Requirement: Session history sync on connect
After completing the `session_register` handshake, the bridge extension SHALL call `SessionManager.list(process.cwd())` to retrieve local session history and send a `session_history_sync` message to the dashboard server. This SHALL occur once per connection (including reconnections). The call SHALL be non-blocking and errors SHALL be silently caught to avoid disrupting normal bridge operation.

#### Scenario: Bridge syncs history after registration
- **WHEN** the bridge extension successfully sends `session_register` to the server
- **THEN** it SHALL asynchronously call `SessionManager.list(process.cwd())` and send a `session_history_sync` message with the results

#### Scenario: Reconnection triggers history sync
- **WHEN** the bridge extension reconnects after a connection drop
- **THEN** it SHALL send `session_history_sync` again as part of the state sync flow

#### Scenario: History sync error is non-fatal
- **WHEN** `SessionManager.list()` throws an error (e.g., filesystem permission issue)
- **THEN** the bridge SHALL catch the error silently and continue normal operation without sending `session_history_sync`

### Requirement: Handle request_models
The bridge extension SHALL handle `request_models` messages by re-reading available models and responding with `models_list`.

#### Scenario: Refresh models
- **WHEN** the extension receives `request_models`
- **THEN** it reads `modelRegistry.getAvailable()` and sends `models_list`

### Requirement: List sessions handler
The bridge extension SHALL handle `list_sessions` messages by importing `SessionManager` from `@mariozechner/pi-coding-agent` and calling its static `list(cwd)` method.

#### Scenario: List sessions request
- **WHEN** the bridge receives a `list_sessions` message with a `cwd`
- **THEN** it SHALL call `SessionManager.list(cwd)` and return a `sessions_list` message with the results

#### Scenario: List sessions failure
- **WHEN** `SessionManager.list(cwd)` throws an error
- **THEN** the bridge SHALL return a `sessions_list` with an empty sessions array
