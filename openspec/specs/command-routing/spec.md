## Purpose

Command routing logic for the bridge extension's send_prompt handler — bang commands, compact, slash commands, and regular text.

## ADDED Requirements

### Requirement: Bang command detection and execution
The command handler SHALL detect `!` and `!!` prefixes in `send_prompt` text and execute them as shell commands via `pi.exec()` instead of sending to the LLM.

- `!!<command>` (double-bang): Execute silently — run the command and forward output to the dashboard only, do NOT send to the LLM.
- `!<command>` (single-bang): Execute and send — run the command and send the command + output as a user message to the LLM.

The command text SHALL be trimmed after removing the prefix. Empty commands after trimming SHALL be ignored and passed through as regular messages.

#### Scenario: Double-bang silent execution
- **WHEN** `send_prompt` text is `!!ls -la`
- **THEN** the handler SHALL execute `ls -la` via `pi.exec()`, forward output as a `bash_output` event with `excludeFromContext: true`, and NOT call `sendUserMessage()`

#### Scenario: Single-bang execution with LLM
- **WHEN** `send_prompt` text is `!git status`
- **THEN** the handler SHALL execute `git status` via `pi.exec()`, forward output as a `bash_output` event with `excludeFromContext: false`, AND send the command + output as a user message to the LLM

#### Scenario: Empty command after prefix
- **WHEN** `send_prompt` text is `!` or `!!` with no command after trimming
- **THEN** the handler SHALL fall through to `sendUserMessage()` with the original text

### Requirement: Bash execution timeout
Shell commands executed via bang prefixes SHALL have a 30-second timeout. If the timeout expires, the partial output collected so far SHALL be forwarded as a `bash_output` event with an indication of timeout.

#### Scenario: Command times out
- **WHEN** a bang command runs for more than 30 seconds
- **THEN** the handler SHALL kill the process, forward collected output as a `bash_output` event, and include a timeout indicator in the output

### Requirement: Compact command routing
The command handler SHALL detect `/compact` in `send_prompt` text and route it to `ctx.compact()` instead of sending to the LLM.

- `/compact` with no arguments: call `compact()` with no options
- `/compact <instructions>`: call `compact({ customInstructions: instructions })`

The handler SHALL send a `command_feedback` event with status `started` when compaction begins.

#### Scenario: Compact without instructions
- **WHEN** `send_prompt` text is `/compact`
- **THEN** the handler SHALL call `ctx.compact()` and send a `command_feedback` event with `command: "/compact"` and `status: "started"`

#### Scenario: Compact with custom instructions
- **WHEN** `send_prompt` text is `/compact summarize only the code changes`
- **THEN** the handler SHALL call `ctx.compact({ customInstructions: "summarize only the code changes" })` and send a `command_feedback` event

### Requirement: Slash command routing through session.prompt()
For `/` prefixed input that is not handled by an earlier routing step (bang commands, `/compact`, `/quit`, `/reload`, `/new`, `/model <provider/id>`, management commands, flow run), the command handler SHALL attempt to dispatch the slash command through pi's extension-command dispatcher via `pi.dispatchCommand(text, options?)` when that method is exposed by the active pi build (feature-detected at runtime). When `pi.dispatchCommand` is unavailable, the handler SHALL apply the **extension-command stopgap** (see ADDED Requirement below) before any fallback to `pi.sendUserMessage(text)`.

The fallback to `pi.sendUserMessage(text)` SHALL be reached ONLY for slash text that:
- Is NOT a registered extension command (per `pi.getCommands()` filtered to `source === "extension"` and not in `DASHBOARD_NATIVE_COMMANDS`), AND
- IS a skill command (`/skill:<name>`), prompt template, or unrecognized slash text whose semantics require LLM interpretation.

The handler SHALL emit `command_feedback { command, status }` events around extension-command dispatch:
- `status: "started"` immediately before invoking `pi.dispatchCommand` (or, in the stopgap path, before emitting the error feedback).
- `status: "completed"` after `pi.dispatchCommand` resolves successfully.
- `status: "error"` with a structured `message` field when the stopgap fires (i.e. extension command detected but `pi.dispatchCommand` not available).

The handler SHALL NOT emit duplicate `command_feedback` events on the dispatch path; pi's `_tryExecuteExtensionCommand` swallows handler exceptions and emits its own `extension_error` events to the runner — those are forwarded by the existing event-wiring path and are not duplicated by this requirement.

#### Scenario: Extension command dispatched via pi.dispatchCommand
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is a function AND `ctx-stats` appears in `pi.getCommands()` with `source: "extension"`
- **THEN** the handler SHALL emit `command_feedback { command: "/ctx-stats", status: "started" }`
- **AND** SHALL call `pi.dispatchCommand("/ctx-stats", { streamingBehavior: "followUp" })`
- **AND** upon resolution SHALL emit `command_feedback { command: "/ctx-stats", status: "completed" }`
- **AND** SHALL NOT call `pi.sendUserMessage(...)`

#### Scenario: Extension command stopgap when pi.dispatchCommand unavailable
- **WHEN** `send_prompt` text is `/ctx-stats` AND `pi.dispatchCommand` is NOT a function AND `ctx-stats` appears in `pi.getCommands()` with `source: "extension"`
- **THEN** the handler SHALL emit `command_feedback { command: "/ctx-stats", status: "started" }`
- **AND** SHALL emit `command_feedback { command: "/ctx-stats", status: "error", message: <human-readable reason citing pi version requirement> }`
- **AND** SHALL NOT call `pi.sendUserMessage(...)` for the slash text
- **AND** SHALL NOT call `pi.dispatchCommand(...)` (it is not a function)

#### Scenario: Skill command expanded (unaffected)
- **WHEN** `send_prompt` text is `/skill:my-skill some args`
- **THEN** the handler SHALL expand the skill via `expandPromptTemplateFromDisk(text, cwd, pi)` and call `pi.sendUserMessage(<expanded>, { deliverAs: "followUp" })`
- **AND** SHALL NOT call `pi.dispatchCommand(...)` (skill commands are not extension commands)

#### Scenario: Prompt template expanded (unaffected)
- **WHEN** `send_prompt` text is `/some-prompt-template arg1 arg2` AND `some-prompt-template` is a registered prompt template (`source: "prompt"`)
- **THEN** the handler SHALL expand the template via `expandPromptTemplateFromDisk(text, cwd, pi)` and call `pi.sendUserMessage(<expanded>, { deliverAs: "followUp" })`
- **AND** SHALL NOT call `pi.dispatchCommand(...)` (prompt templates are not extension commands)

#### Scenario: Unrecognized slash falls through
- **WHEN** `send_prompt` text is `/totally-unknown-command` AND no entry with name `totally-unknown-command` exists in `pi.getCommands()`
- **THEN** the handler SHALL fall through to `pi.sendUserMessage("/totally-unknown-command", { deliverAs: "followUp" })`
- **AND** SHALL NOT emit `command_feedback` events for this text
- **AND** SHALL NOT call `pi.dispatchCommand(...)`

#### Scenario: Bridge-native command suppressed from extension detection
- **WHEN** `send_prompt` text is `/__dashboard_reload`
- **THEN** the handler SHALL fall through to `pi.sendUserMessage(...)` (bridge-native commands are excluded from extension detection via `DASHBOARD_NATIVE_COMMANDS`)
- **AND** SHALL NOT emit `command_feedback { status: "error" }` for it

### Requirement: Command routing order
The command handler SHALL process `send_prompt` text in this exact order:

1. Check for `!!` prefix → silent bash execution
2. Check for `!` prefix → bash execution with LLM send
3. Check for `/compact` → compact routing
4. Check for `/quit` or `/exit` → shutdown
5. Check for `/reload` → extension reload
6. Check for `/new` → spawn new session in same cwd
7. Check for `/model provider/id` → model switch via `setModel` callback
8. Check for `/` prefix matching a known **user-defined flow name** (from `getFlowsList()`) → emit `flow:run` event
9. Check for `/` prefix matching a known **extension command** (`source: "extension"` in `pi.getCommands()`, excluding `DASHBOARD_NATIVE_COMMANDS`) → dispatch via `pi.dispatchCommand` (when available) OR emit `command_feedback { status: "error" }` stopgap (when unavailable)
10. Check for `/` prefix → fall through to template expansion + `pi.sendUserMessage()` (handles skills, prompt templates, unrecognized slashes)
11. Default (no `/` prefix) → `pi.sendUserMessage(text)` (existing passthrough behavior)

Note: pi-flows management commands (`/flows`, `/flows:new`, `/flows:edit`, `/flows:delete`, `/roles`) are registered by the pi-flows extension via `pi.registerCommand` and are therefore handled by step 9 (extension dispatch) when `pi.dispatchCommand` is available, or by the stopgap when it is not. The kebab-menu UI continues to invoke `flows:new-request` / `flows:edit-request` / `flow:run` / `flow:delete-request` directly via the `flow_management` WebSocket message handler in `bridge.ts` — that path is independent of typed-text command routing and is not covered by this requirement.

#### Scenario: Routing precedence — bang beats slash
- **WHEN** `send_prompt` text is `!!echo /ctx-stats`
- **THEN** the handler SHALL execute `echo /ctx-stats` as a silent bash command
- **AND** SHALL NOT invoke any slash routing branch

#### Scenario: Routing precedence — user-defined flow run beats extension dispatch
- **WHEN** `send_prompt` text is `/deploy-prod` AND `deploy-prod` is a user-defined flow name returned by `getFlowsList()` AND ALSO appears in `pi.getCommands()`
- **THEN** the handler SHALL emit `flow:run { flowName: "deploy-prod" }` via `pi.events.emit(...)` (step 8 wins over step 9)
- **AND** SHALL NOT call `pi.dispatchCommand(...)` for this text

#### Scenario: Routing precedence — typed `/flows:new` rides extension dispatch
- **WHEN** `send_prompt` text is `/flows:new` AND `getFlowsList()` does NOT contain a user-defined flow named `flows:new` AND `pi.getCommands()` contains `{ name: "flows:new", source: "extension" }` (registered by pi-flows)
- **THEN** step 8 SHALL NOT match (no user-defined flow)
- **AND** step 9 SHALL fire: dispatch via `pi.dispatchCommand` when available, stopgap `command_feedback { status: "error" }` otherwise
- **AND** SHALL NOT call `pi.sendUserMessage(...)` for the slash text

#### Scenario: Extension dispatch beats fall-through
- **WHEN** `send_prompt` text is `/ctx-stats` AND `ctx-stats` is an extension command AND no earlier step matches
- **THEN** step 9 fires (extension dispatch or stopgap)
- **AND** step 10's fall-through to `pi.sendUserMessage(...)` SHALL NOT execute

### Requirement: Model command routing
The command handler SHALL detect `/model provider/id` in `send_prompt` text and route it through the `setModel` callback instead of sending to the LLM. The `/model` command is a TUI-only command in pi and does not work via `session.prompt()` or `sendUserMessage()`.

- `/model provider/id` (with a `/` in the argument): call `setModel(provider, modelId)` and send a `command_feedback` event
- `/model` (bare, no argument) or `/model name` (no `/` in argument): fall through to generic slash command routing (opens TUI model selector)

#### Scenario: Model switch with provider/id
- **WHEN** `send_prompt` text is `/model anthropic/claude-haiku-4-5`
- **THEN** the handler SHALL call `setModel("anthropic", "claude-haiku-4-5")` and send a `command_feedback` event with `command: "/model anthropic/claude-haiku-4-5"` and `status: "completed"`
- **AND** SHALL NOT call `sendUserMessage()`

#### Scenario: Bare /model falls through
- **WHEN** `send_prompt` text is `/model` or `/model something` (no `/` in argument)
- **THEN** the handler SHALL fall through to generic slash command routing

### Requirement: Extension slash command detection
The command handler SHALL provide a pure helper `isExtensionSlashCommand(text, commandList)` that returns true iff:
- `text` starts with `/` AND has no embedded newline
- The token between the leading `/` and the first space (or end of string) — call it `cmdName` — appears in `commandList` with `source === "extension"`
- `cmdName` is NOT in `DASHBOARD_NATIVE_COMMANDS` (the same set used by `filterHiddenCommands` in `bridge-context.ts`)

This helper SHALL be exported and used by the bridge's `sessionPrompt` callback in `bridge.ts` to gate steps 11/12 of the routing order.

The helper SHALL NOT mutate `commandList` and SHALL NOT call any pi APIs. It is a pure string + array predicate suitable for unit testing without a stub pi.

#### Scenario: Detects bare extension command
- **WHEN** called with `("/ctx-stats", [{ name: "ctx-stats", source: "extension" }])`
- **THEN** SHALL return `true`

#### Scenario: Detects extension command with arguments
- **WHEN** called with `("/ctx-stats verbose=1", [{ name: "ctx-stats", source: "extension" }])`
- **THEN** SHALL return `true`

#### Scenario: Rejects skill command
- **WHEN** called with `("/skill:foo", [{ name: "skill:foo", source: "skill" }])`
- **THEN** SHALL return `false` (source is `skill`, not `extension`)

#### Scenario: Rejects prompt template
- **WHEN** called with `("/review", [{ name: "review", source: "prompt" }])`
- **THEN** SHALL return `false`

#### Scenario: Rejects bridge-native dashboard command
- **WHEN** called with `("/__dashboard_reload", [{ name: "__dashboard_reload", source: "extension" }])`
- **THEN** SHALL return `false` (excluded by `DASHBOARD_NATIVE_COMMANDS`)

#### Scenario: Rejects unknown slash
- **WHEN** called with `("/totally-unknown", [])`
- **THEN** SHALL return `false`

#### Scenario: Rejects multi-line input
- **WHEN** called with `("/ctx-stats\nuser context", [{ name: "ctx-stats", source: "extension" }])`
- **THEN** SHALL return `false` (multi-line slashes are passthrough by `parseSendPrompt`)

#### Scenario: Rejects non-slash input
- **WHEN** called with `("hello world", [{ name: "ctx-stats", source: "extension" }])`
- **THEN** SHALL return `false`

### Requirement: Bridge feature-detects pi.dispatchCommand
The bridge's `sessionPrompt` callback in `packages/extension/src/bridge.ts` SHALL feature-detect the presence of `pi.dispatchCommand` at call time using `typeof (pi as any).dispatchCommand === "function"`.

The bridge SHALL NOT cache the feature-detection result across `sessionPrompt` invocations — pi's API surface is fixed per process, but call-time check keeps the wiring identical between fresh-spawn and live-reload paths.

The bridge SHALL NOT use pi version strings, semver checks, or any other version-sniffing mechanism for this gate.

#### Scenario: pi 0.71+ with dispatchCommand
- **WHEN** the bridge's `sessionPrompt` is invoked with `/ctx-stats` AND `(pi as any).dispatchCommand` is a function
- **THEN** the bridge SHALL invoke `(pi as any).dispatchCommand("/ctx-stats", { streamingBehavior: "followUp" })`

#### Scenario: pi 0.70 without dispatchCommand
- **WHEN** the bridge's `sessionPrompt` is invoked with `/ctx-stats` AND `(pi as any).dispatchCommand` is `undefined`
- **THEN** the bridge SHALL apply the extension-command stopgap (emit `command_feedback { status: "error" }`) and SHALL NOT call `pi.sendUserMessage(...)` for this text
