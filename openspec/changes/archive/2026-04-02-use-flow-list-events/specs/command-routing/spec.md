## MODIFIED Requirements

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
