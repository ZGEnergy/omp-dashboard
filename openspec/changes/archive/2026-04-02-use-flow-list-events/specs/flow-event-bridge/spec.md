## ADDED Requirements

### Requirement: Bridge emits flows:new-request for /flows:new
The bridge's `sessionPrompt` handler SHALL detect `/flows:new` commands and emit `flows:new-request` event directly instead of falling through to `sendUserMessage`.

#### Scenario: /flows:new with description
- **WHEN** `sessionPrompt` receives `/flows:new design a code review flow`
- **THEN** the bridge SHALL emit `pi.events.emit("flows:new-request", { description: "design a code review flow" })`
- **AND** SHALL NOT call `sendUserMessage`

#### Scenario: /flows:new without description
- **WHEN** `sessionPrompt` receives `/flows:new`
- **THEN** the bridge SHALL emit `pi.events.emit("flows:new-request", { description: "" })`
- **AND** pi-flows' handler SHALL prompt the user for a description via ctx.ui

### Requirement: Bridge emits flows:edit-request for /flows:edit
The bridge's `sessionPrompt` handler SHALL detect `/flows:edit` commands and emit `flows:edit-request` event directly.

#### Scenario: /flows:edit with name
- **WHEN** `sessionPrompt` receives `/flows:edit my-flow`
- **THEN** the bridge SHALL emit `pi.events.emit("flows:edit-request", { flowName: "my-flow" })`
- **AND** SHALL NOT call `sendUserMessage`

#### Scenario: /flows:edit without name
- **WHEN** `sessionPrompt` receives `/flows:edit`
- **THEN** the bridge SHALL emit `pi.events.emit("flows:edit-request", { flowName: "" })`
- **AND** pi-flows' handler SHALL prompt the user to select a flow via ctx.ui

### Requirement: Bridge routes /flows:delete through session.prompt
The bridge's `sessionPrompt` handler SHALL route `/flows:delete` through the standard slash command path (session.prompt or sendUserMessage fallback), allowing pi-flows' registered command handler to execute.

#### Scenario: /flows:delete routed to command handler
- **WHEN** `sessionPrompt` receives `/flows:delete my-flow`
- **THEN** the bridge SHALL NOT handle it specially
- **AND** SHALL route it through the existing slash command pipeline

### Requirement: Bridge uses flow:list-flows for flow command detection
The bridge's `sessionPrompt` handler SHALL use `flow:list-flows` event to determine whether a slash command is a user-defined flow, instead of filtering `pi.getCommands()` by source.

#### Scenario: Flow command detected via flow:list-flows
- **WHEN** `sessionPrompt` receives `/my-custom-flow some task`
- **AND** `flow:list-flows` returns a flow named `my-custom-flow`
- **THEN** the bridge SHALL emit `flow:run` with `{ flowName: "my-custom-flow", task: "some task" }`

#### Scenario: Unknown slash command falls through
- **WHEN** `sessionPrompt` receives `/unknown-cmd args`
- **AND** `flow:list-flows` does NOT include `unknown-cmd`
- **THEN** the bridge SHALL fall through to the existing slash command routing

## REMOVED Requirements

### Requirement: flows-mgmt.ts input event interceptor
**Reason**: Replaced by direct event emission from bridge sessionPrompt and pi-flows' own registered command handlers
**Migration**: `/flows:new` and `/flows:edit` use event emission; `/flows:delete` routes through session.prompt to pi-flows' handler
