## Purpose

Persistent per-session proposal focus with attach/detach, server-side auto-attach from activity detection, and auto-naming of sessions from the attached proposal.

## ADDED Requirements

### Requirement: AttachedProposal field on DashboardSession
The `DashboardSession` type SHALL include an optional `attachedProposal?: string | null` field representing the currently focused OpenSpec change name for this session.

#### Scenario: Session with attached proposal
- **WHEN** a session has `attachedProposal` set to `"add-auth"`
- **THEN** the OpenSpec section SHALL show only the `"add-auth"` change

#### Scenario: Session without attached proposal
- **WHEN** a session has `attachedProposal` undefined or null
- **THEN** the OpenSpec section SHALL show all changes

### Requirement: Manual attach via browser
The browser SHALL send an `attach_proposal` message to attach a proposal to a session. The server SHALL set `session.attachedProposal` to the given `changeName` and broadcast a `session_updated` message. Attach is triggered via a combo box dropdown on the session card instead of per-change "Attach" buttons.

#### Scenario: User selects change from combo box
- **WHEN** the user selects `"add-auth"` from the attach combo box on session `"s1"`
- **THEN** the browser SHALL send `{ type: "attach_proposal", sessionId: "s1", changeName: "add-auth" }`
- **AND** the server SHALL set `session.attachedProposal = "add-auth"` and broadcast the update

### Requirement: Manual detach via browser
The browser SHALL send a `detach_proposal` message to clear the attached proposal. The server SHALL set `session.attachedProposal` to null, clear `openspecPhase` and `openspecChange` to null, and broadcast a `session_updated` message. The session name SHALL NOT be reverted.

#### Scenario: User clicks Detach
- **WHEN** the user clicks the "Detach" button on session `"s1"`
- **THEN** the browser SHALL send `{ type: "detach_proposal", sessionId: "s1" }`
- **AND** the server SHALL set `session.attachedProposal = null`, `session.openspecPhase = null`, `session.openspecChange = null` and broadcast the update
- **AND** the session name SHALL remain unchanged

#### Scenario: Re-detection after detach
- **WHEN** a proposal is detached from a session
- **AND** the session later receives new `openspec_activity_update` messages with both phase and changeName
- **THEN** the server SHALL auto-attach the newly detected change

### Requirement: DetectedActivity includes active flag
The `DetectedActivity` interface SHALL include an `isActive` boolean field that indicates whether the detected activity represents an active operation (write, CLI command) or a passive operation (read). Read operations return `isActive: false`, write and bash/CLI operations return `isActive: true`. Phase-only detections (SKILL.md reads) omit `isActive`.

#### Scenario: Read operation returns isActive false
- **WHEN** `detectOpenSpecActivity` is called with tool "read" and a path matching `openspec/changes/<name>/`
- **THEN** the result SHALL include `isActive: false`

#### Scenario: Write operation returns isActive true
- **WHEN** `detectOpenSpecActivity` is called with tool "write" and a path matching `openspec/changes/<name>/`
- **THEN** the result SHALL include `isActive: true`

#### Scenario: Bash CLI command returns isActive true
- **WHEN** `detectOpenSpecActivity` is called with tool "bash" and a command containing an openspec CLI invocation with a change name
- **THEN** the result SHALL include `isActive: true`

#### Scenario: Phase-only detection omits isActive
- **WHEN** `detectOpenSpecActivity` is called with a SKILL.md read (phase detection only, no changeName)
- **THEN** the result SHALL NOT include `isActive`

### Requirement: Server-side auto-attach from activity detection
When the server receives `openspec_activity_update` messages, it SHALL update the session's `openspecPhase` and `openspecChange` fields independently. After each update, if the session has `openspecChange` set, no `attachedProposal`, and the detected activity has `isActive: true`, the server SHALL automatically set `attachedProposal` to the session's accumulated `openspecChange` value. Read-only operations (`isActive: false`) update tracking fields but SHALL NOT trigger auto-attach.

#### Scenario: Auto-attach on active write operation
- **WHEN** the server detects a write to `openspec/changes/add-auth/proposal.md` for a session with `attachedProposal = null`
- **THEN** the server SHALL set `session.attachedProposal = "add-auth"` and broadcast `session_updated`

#### Scenario: Auto-attach on bash CLI operation
- **WHEN** the server detects `openspec new change "add-auth"` for a session with `attachedProposal = null`
- **THEN** the server SHALL set `session.attachedProposal = "add-auth"` and broadcast `session_updated`

#### Scenario: No auto-attach on read operation
- **WHEN** the server detects a read of `openspec/changes/add-auth/proposal.md` for a session with `attachedProposal = null`
- **THEN** `openspecChange` SHALL update to "add-auth" but `attachedProposal` SHALL remain unset

#### Scenario: No auto-attach when proposal already attached
- **WHEN** the server receives `openspec_activity_update` with `changeName: "other-change"` for a session with `attachedProposal = "add-auth"`
- **THEN** the server SHALL NOT change `attachedProposal`

#### Scenario: No auto-attach when only phase detected
- **WHEN** the server receives `openspec_activity_update` with `phase: "explore"` but no `changeName` for a session with `openspecChange = null`
- **THEN** the server SHALL NOT set `attachedProposal`

### Requirement: Case-insensitive tool name matching in activity detector
The `detectOpenSpecActivity` function SHALL match tool names case-insensitively. Pi emits lowercase tool names (`"read"`, `"bash"`, `"write"`) and the detector SHALL handle any casing.

#### Scenario: Lowercase tool name from pi
- **WHEN** a `tool_execution_start` event arrives with `toolName: "read"` and a path matching an openspec skill file
- **THEN** the detector SHALL return the detected phase

#### Scenario: Capitalized tool name
- **WHEN** a `tool_execution_start` event arrives with `toolName: "Read"` and a path matching an openspec change file
- **THEN** the detector SHALL return the detected change name

#### Scenario: Lowercase bash with openspec CLI command
- **WHEN** a `tool_execution_start` event arrives with `toolName: "bash"` and a command containing `openspec status --change "add-auth"`
- **THEN** the detector SHALL return `{ changeName: "add-auth" }`

### Requirement: Detect change name from openspec new change command
The activity detector SHALL detect the change name from `openspec new change "name"` commands using positional arguments, not just the `--change` flag pattern.

#### Scenario: openspec new change with quoted name
- **WHEN** a bash tool call contains `openspec new change "add-auth"`
- **THEN** the detector SHALL return `{ changeName: "add-auth" }`

#### Scenario: openspec new change with unquoted name
- **WHEN** a bash tool call contains `openspec new change add-auth`
- **THEN** the detector SHALL return `{ changeName: "add-auth" }`

### Requirement: Auto-name session on attach
When a proposal is attached (manually or automatically) and the session's `name` field is empty/undefined, the server SHALL set `session.name` to the proposal name and send a `rename_session` message to the extension so pi's internal session name is updated.

#### Scenario: Auto-name on attach when name is empty
- **WHEN** a proposal `"add-auth"` is attached to a session with `name = undefined`
- **THEN** the server SHALL set `session.name = "add-auth"` and send `rename_session` to the extension

#### Scenario: No auto-name when name already set
- **WHEN** a proposal `"add-auth"` is attached to a session with `name = "my custom name"`
- **THEN** the server SHALL NOT change `session.name`

#### Scenario: Detach does not revert name
- **WHEN** a proposal is detached from a session that was auto-named
- **THEN** the session name SHALL remain as the proposal name (not reverted)

### Requirement: Activity detector rejects flag-shaped change names
`detectOpenSpecActivity` SHALL NOT return a `changeName` whose first character is `-`. When a CLI regex (archive, new-change, or `--change` flag) captures a token starting with `-`, the function SHALL return `null` instead of a `DetectedActivity` with that token. This prevents downstream auto-attach and auto-rename from being driven by CLI flags such as `--help`.

#### Scenario: openspec archive --help is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec archive --help"`
- **THEN** the result SHALL be `null`

#### Scenario: openspec new change --help is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec new change --help"`
- **THEN** the result SHALL be `null`

#### Scenario: --change flag followed by another flag is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec foo --change --help"`
- **THEN** the result SHALL be `null`

#### Scenario: Real change names are still extracted
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec archive add-auth"`
- **THEN** the result SHALL be `{ changeName: "add-auth", isActive: true }`

#### Scenario: Quoted change names are still extracted
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `'openspec archive "add-auth"'`
- **THEN** the result SHALL be `{ changeName: "add-auth", isActive: true }`
