## MODIFIED Requirements

### Requirement: Slash command routing through session.prompt()
For `/` prefixed input that is not handled by an earlier routing step (bang commands, `/compact`, `/quit`, `/reload`, `/new`, `/model <provider/id>`, management commands, flow run), the command handler SHALL attempt to dispatch the slash command using a **three-way decision**, in this order:

1. **Path B (preferred when available)**: if `pi.dispatchCommand` is exposed by the active pi build (feature-detected via `hasDispatchCommand(pi)`), the handler SHALL call `pi.dispatchCommand(text, {streamingBehavior: "followUp"})` directly. Bridge emits `command_feedback {status: "started"}` before the call and `{status: "completed"}` after it resolves (or `{status: "error", message: err.message}` on rejection).

2. **Path C (when pi.dispatchCommand absent and session is headless RPC)**: if `pi.dispatchCommand` is NOT a function AND the bridge detects a headless RPC pi (per `isHeadlessRpcSession()`), the handler SHALL emit `command_feedback {status: "started"}` and emit a server-bound message `{type: "dispatch_extension_command", sessionId, command, requestId: <uuid>}`. The server's keeper-manager SHALL write the corresponding pi RPC line to the session's keeper UDS / named pipe. The server emits the terminal `command_feedback` event (`completed` on UDS-write success — optimistic; `error` on UDS-write failure). The bridge SHALL NOT emit a terminal event for this path.

3. **Path D (stopgap, last resort)**: if neither Path B nor Path C is reachable (i.e. `pi.dispatchCommand` absent AND non-headless session — tmux / wt / unrecognized spawn), the handler SHALL emit `command_feedback {status: "started"}` followed by `{status: "error", message: <pi version requirement reason>}`. This preserves the existing stopgap behavior introduced by `fix-extension-slash-commands-in-dashboard`.

The fallback to `pi.sendUserMessage(text)` SHALL be reached ONLY for slash text that:
- Is NOT a registered extension command (per `pi.getCommands()` filtered to `source === "extension"` and not in `DASHBOARD_NATIVE_COMMANDS`), AND
- IS a skill command (`/skill:<name>`), prompt template, or unrecognized slash text whose semantics require LLM interpretation.

The handler SHALL emit EXACTLY ONE `started` event and EXACTLY ONE terminal event (`completed` xor `error`) per dispatch invocation across all three paths combined. The server's optimistic `completed` for Path C is the terminal event for that path; the bridge SHALL NOT emit an additional terminal event after sending `dispatch_extension_command`.

#### Scenario: Path B — pi.dispatchCommand available
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is a function
- **THEN** the bridge SHALL emit `command_feedback {command: "/ctx-stats", status: "started"}`
- **AND** SHALL call `pi.dispatchCommand("/ctx-stats", {streamingBehavior: "followUp"})`
- **AND** upon resolution SHALL emit `command_feedback {command: "/ctx-stats", status: "completed"}`
- **AND** SHALL NOT emit `dispatch_extension_command`

#### Scenario: Path C — headless RPC session, dispatchCommand absent
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is NOT a function AND `isHeadlessRpcSession()` returns true
- **THEN** the bridge SHALL emit `command_feedback {command: "/ctx-stats", status: "started"}`
- **AND** the bridge SHALL emit `dispatch_extension_command {sessionId, command: "/ctx-stats", requestId}` to the server
- **AND** the server SHALL write `{"type":"prompt","message":"/ctx-stats","id":"<requestId>"}\n` to the session's keeper UDS / named pipe
- **AND** the server SHALL emit `command_feedback {command: "/ctx-stats", status: "completed"}` to browser subscribers (optimistic)
- **AND** the bridge SHALL NOT emit `command_feedback {status: "completed"}` for this dispatch

#### Scenario: Path D — non-headless session, dispatchCommand absent (stopgap)
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is NOT a function AND `isHeadlessRpcSession()` returns false (tmux / wt / unrecognized)
- **THEN** the bridge SHALL emit `command_feedback {command: "/ctx-stats", status: "started"}`
- **AND** the bridge SHALL emit `command_feedback {command: "/ctx-stats", status: "error", message: <pi version requirement reason>}`
- **AND** the bridge SHALL NOT emit `dispatch_extension_command`
- **AND** the bridge SHALL NOT call `pi.sendUserMessage(...)` for this text

#### Scenario: Path C fallback to error when keeper unavailable
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` absent AND headless detected AND the bridge sends `dispatch_extension_command` AND the server has no keeper for that session
- **THEN** the bridge's emission proceeds as Path C
- **AND** the server SHALL emit `command_feedback {command: "/ctx-stats", status: "error", message: <reason: keeper unavailable>}` to browser subscribers
- **AND** the chat row SHALL transition from "in progress" to "failed" via the existing started→terminal reducer upsert

#### Scenario: No duplicate command_feedback across paths
- **WHEN** any single dispatch path fires (B, C, or D)
- **THEN** the recorded `command_feedback` events for that command-text SHALL contain EXACTLY ONE `status: "started"` event AND EXACTLY ONE terminal event (either `completed` or `error`) — never both
