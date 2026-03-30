## MODIFIED Requirements

### Requirement: Attach proposal browser message
The browser→server protocol SHALL include an `attach_proposal` message type with fields `sessionId: string` and `changeName: string`. This type SHALL be a member of the `BrowserToServerMessage` union type.

#### Scenario: Attach proposal message sent
- **WHEN** the browser sends `{ type: "attach_proposal", sessionId: "s1", changeName: "add-auth" }`
- **THEN** the server SHALL process the attachment and broadcast a `session_updated` with `attachedProposal: "add-auth"`

### Requirement: Detach proposal browser message
The browser→server protocol SHALL include a `detach_proposal` message type with field `sessionId: string`. This type SHALL be a member of the `BrowserToServerMessage` union type.

#### Scenario: Detach proposal message sent
- **WHEN** the browser sends `{ type: "detach_proposal", sessionId: "s1" }`
- **THEN** the server SHALL process the detachment and broadcast a `session_updated` with `attachedProposal: null`

## ADDED Requirements

### Requirement: Terminal control browser messages
The `BrowserToServerMessage` union SHALL include `create_terminal` (fields: `cwd: string`), `kill_terminal` (fields: `terminalId: string`), and `rename_terminal` (fields: `terminalId: string`, `title: string`) message types.

#### Scenario: Create terminal message type-checks
- **WHEN** client code sends `{ type: "create_terminal", cwd: "/path" }`
- **THEN** it SHALL compile without `as any` casts

#### Scenario: Kill terminal message type-checks
- **WHEN** client code sends `{ type: "kill_terminal", terminalId: "term-abc" }`
- **THEN** it SHALL compile without `as any` casts

### Requirement: Session management browser messages
The `BrowserToServerMessage` union SHALL include `resume_session` (fields: `sessionId: string`, `mode: "continue" | "fork"`), `spawn_session` (fields: `cwd: string`), `reorder_sessions` (fields: `cwd: string`, `sessionIds: string[]`), and `extension_ui_response` (fields: `sessionId: string`, `requestId: string`, `result?: unknown`, `cancelled?: boolean`) message types.

#### Scenario: Resume session message type-checks
- **WHEN** client code sends `{ type: "resume_session", sessionId: "s1", mode: "fork" }`
- **THEN** it SHALL compile without `as any` casts

#### Scenario: Spawn session message type-checks
- **WHEN** client code sends `{ type: "spawn_session", cwd: "/path" }`
- **THEN** it SHALL compile without `as any` casts

### Requirement: Pinned directory browser messages
The `BrowserToServerMessage` union SHALL include `pin_directory` (fields: `path: string`), `unpin_directory` (fields: `path: string`), and `reorder_pinned_dirs` (fields: `paths: string[]`) message types.

#### Scenario: Pin directory message type-checks
- **WHEN** client code sends `{ type: "pin_directory", path: "/path" }`
- **THEN** it SHALL compile without `as any` casts

### Requirement: DashboardSession currentTool allows null
The `DashboardSession.currentTool` field SHALL be typed as `string | null | undefined` to support explicit clearing via `null` (which survives JSON serialization, unlike `undefined`).

#### Scenario: currentTool set to null
- **WHEN** the server sends `session_updated` with `{ currentTool: null }`
- **THEN** the browser SHALL receive `null` (not `undefined`) after JSON deserialization
- **AND** the session card SHALL clear any tool indicator
