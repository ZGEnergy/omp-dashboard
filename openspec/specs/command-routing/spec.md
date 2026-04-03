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
For `/` prefixed input that is not `/compact`, the command handler SHALL attempt to route through `session.prompt(text)` to enable extension command execution, skill expansion, and prompt template expansion.

If `session.prompt()` is not accessible, the handler SHALL fall back to `pi.sendUserMessage(text)`.

#### Scenario: Extension command executed
- **WHEN** `send_prompt` text is `/some-extension-command args`
- **THEN** the handler SHALL call `session.prompt("/some-extension-command args")` which dispatches to the extension command handler

#### Scenario: Skill command expanded
- **WHEN** `send_prompt` text is `/skill:my-skill some args`
- **THEN** the handler SHALL call `session.prompt("/skill:my-skill some args")` which expands the skill content and sends to the LLM

#### Scenario: Prompt template expanded
- **WHEN** `send_prompt` text is `/review focus on security`
- **THEN** the handler SHALL call `session.prompt("/review focus on security")` which expands the prompt template

#### Scenario: Session.prompt not available fallback
- **WHEN** `send_prompt` text starts with `/` and `session.prompt()` is not accessible
- **THEN** the handler SHALL fall back to `pi.sendUserMessage(text)`

### Requirement: Command routing order
The command handler SHALL process `send_prompt` text in this exact order:

1. Check for `!!` prefix → silent bash execution
2. Check for `!` prefix → bash execution with LLM send
3. Check for `/compact` → compact routing
4. Check for `/quit` or `/exit` → shutdown
5. Check for `/reload` → extension reload
6. Check for `/model provider/id` → model switch via `setModel` callback
7. Check for `/flows:new` → emit `flows:new-request` event
8. Check for `/flows:edit` → emit `flows:edit-request` event
9. Check for `/` prefix matching a known flow name → emit `flow:run` event
10. Check for `/` prefix → session.prompt() routing (handles `/flows:delete` and other commands)
11. Default → `pi.sendUserMessage(text)` (existing behavior)

#### Scenario: Routing precedence
- **WHEN** `send_prompt` text is `!!echo hello`
- **THEN** the handler SHALL match step 1 (double-bang) and NOT proceed to subsequent checks

#### Scenario: Non-command text passthrough
- **WHEN** `send_prompt` text is `explain this code`
- **THEN** the handler SHALL reach step 11 and call `pi.sendUserMessage("explain this code")`

#### Scenario: Flow management command routed via event
- **WHEN** `send_prompt` text is `/flows:new my description`
- **THEN** the handler SHALL match step 7 and emit `flows:new-request`

#### Scenario: User-defined flow routed via flow:run
- **WHEN** `send_prompt` text is `/my-flow task`
- **AND** `flow:list-flows` includes a flow named `my-flow`
- **THEN** the handler SHALL match step 9 and emit `flow:run`

#### Scenario: Unknown slash command falls through to session.prompt
- **WHEN** `send_prompt` text is `/some-skill args`
- **AND** it does not match any flow name
- **THEN** the handler SHALL match step 10 and call `session.prompt()`

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
