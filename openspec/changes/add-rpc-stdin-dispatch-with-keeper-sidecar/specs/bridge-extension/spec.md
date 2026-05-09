## MODIFIED Requirements

### Requirement: Slash dispatch helper applies three-way decision
The `tryDispatchExtensionCommand(pi, text, sessionId, sink, connection)` helper in `packages/extension/src/slash-dispatch.ts` SHALL apply a three-way decision (extending the two-way Path B / Path D logic introduced by `fix-extension-slash-commands-in-dashboard`):

1. **Path B**: when `hasDispatchCommand(pi)` is true → call `pi.dispatchCommand(text, {streamingBehavior: "followUp"})`. Emit `started` before, `completed`/`error` after.

2. **Path C**: when `hasDispatchCommand(pi)` is false AND `isHeadlessRpcSession()` is true → emit `started`; emit `dispatch_extension_command` to the server via the connection; **do NOT emit a terminal event** (server emits it).

3. **Path D (stopgap)**: when `hasDispatchCommand(pi)` is false AND `isHeadlessRpcSession()` is false → emit `started` followed by `error` with the existing pi-version-requirement message.

The helper SHALL maintain its existing return shape: `Promise<boolean>` where `true` indicates the helper handled the text (caller MUST NOT fall through to template expansion or `sendUserMessage`); `false` indicates the text is not an extension command (caller proceeds with existing fallback).

The helper SHALL accept a new optional parameter `connection` (the bridge's WebSocket connection manager) to send `dispatch_extension_command`. If `connection` is undefined (e.g. called from a unit test without a server connection), Path C SHALL gracefully degrade to Path D.

#### Scenario: Path B preferred when pi.dispatchCommand exists
- **GIVEN** `pi.dispatchCommand` is a function AND `text` is `/ctx-stats` AND `ctx-stats` is in `pi.getCommands()` with `source: "extension"`
- **WHEN** `tryDispatchExtensionCommand(pi, text, sessionId, sink, connection)` is called
- **THEN** `pi.dispatchCommand("/ctx-stats", {streamingBehavior: "followUp"})` SHALL be invoked
- **AND** sink SHALL receive `command_feedback {status: "started"}` then `{status: "completed"}`
- **AND** `connection.send` SHALL NOT be called for `dispatch_extension_command`
- **AND** the helper SHALL return `true`

#### Scenario: Path C activated when headless RPC and dispatchCommand absent
- **GIVEN** `pi.dispatchCommand` is undefined AND `isHeadlessRpcSession()` returns true AND `text` is `/ctx-stats`
- **WHEN** `tryDispatchExtensionCommand(pi, text, sessionId, sink, connection)` is called
- **THEN** sink SHALL receive `command_feedback {status: "started"}`
- **AND** `connection.send` SHALL be called with `{type: "dispatch_extension_command", sessionId, command: "/ctx-stats", requestId: <uuid>}`
- **AND** sink SHALL NOT receive a terminal `command_feedback` event from this helper (server emits it)
- **AND** the helper SHALL return `true`

#### Scenario: Path D stopgap when not headless and dispatchCommand absent
- **GIVEN** `pi.dispatchCommand` is undefined AND `isHeadlessRpcSession()` returns false AND `text` is `/ctx-stats`
- **WHEN** `tryDispatchExtensionCommand(pi, text, sessionId, sink, connection)` is called
- **THEN** sink SHALL receive `command_feedback {status: "started"}` followed by `{status: "error", message: <pi version requirement>}`
- **AND** `connection.send` SHALL NOT be called
- **AND** the helper SHALL return `true`

#### Scenario: Path C degrades to Path D when connection is undefined
- **GIVEN** `pi.dispatchCommand` is undefined AND `isHeadlessRpcSession()` returns true AND `connection` argument is undefined
- **WHEN** `tryDispatchExtensionCommand(pi, text, sessionId, sink, undefined)` is called
- **THEN** the helper SHALL fall through to Path D and emit `started` + `error`
- **AND** the helper SHALL NOT throw

#### Scenario: Non-extension command unaffected
- **GIVEN** `text` is `/skill:foo` (source: "skill") OR `/totally-unknown` (no match in getCommands)
- **WHEN** `tryDispatchExtensionCommand(pi, text, sessionId, sink, connection)` is called
- **THEN** the helper SHALL return `false`
- **AND** sink SHALL NOT receive any `command_feedback` events
- **AND** `connection.send` SHALL NOT be called for `dispatch_extension_command`


### Requirement: Bridge wires connection into slash-dispatch helper call sites
Both call sites of `tryDispatchExtensionCommand` (`bridge.ts::sessionPrompt` and `command-handler.ts`'s slash else-arm) SHALL pass the bridge's `ConnectionManager` as the `connection` argument.

In `command-handler.ts`'s slash else-arm (the test-shim path used when `options.sessionPrompt` is undefined), the `connection` argument MAY be undefined (e.g. unit tests without a real connection); the helper degrades to Path D as specified above.

#### Scenario: Bridge sessionPrompt passes connection
- **WHEN** the bridge's `sessionPrompt(text)` callback is invoked for an extension slash command in a headless RPC pi
- **THEN** `tryDispatchExtensionCommand` SHALL be called with `connection: <bridge's ConnectionManager>`
- **AND** Path C SHALL fire and emit `dispatch_extension_command` via the connection

#### Scenario: command-handler else-arm without connection
- **WHEN** `command-handler.ts`'s slash else-arm runs (in a unit test or non-bridge context) AND `options.sessionPrompt` is undefined AND `options.eventSink` is provided
- **THEN** `tryDispatchExtensionCommand` SHALL be called with `connection: undefined`
- **AND** the helper SHALL degrade to Path D for any extension slash command (no `dispatch_extension_command` emitted)
