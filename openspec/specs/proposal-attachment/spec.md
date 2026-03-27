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

### Requirement: Server-side auto-attach from activity detection
When the server receives `openspec_activity_update` messages, it SHALL update the session's `openspecPhase` and `openspecChange` fields independently. After each update, if the session has both `openspecPhase` and `openspecChange` set and no `attachedProposal`, the server SHALL automatically set `attachedProposal` to the session's accumulated `openspecChange` value.

#### Scenario: Auto-attach on first activity detection
- **WHEN** the server receives `openspec_activity_update` with `phase: "apply"` and `changeName: "add-auth"` for a session with `attachedProposal = null`
- **THEN** the server SHALL set `session.attachedProposal = "add-auth"` and broadcast `session_updated`

#### Scenario: Auto-attach from separately arriving phase and changeName
- **WHEN** the server receives `openspec_activity_update` with `phase: "apply"` (no changeName) for a session with `attachedProposal = null`
- **AND** later receives `openspec_activity_update` with `changeName: "add-auth"` (no phase) for the same session
- **THEN** the server SHALL set `session.attachedProposal = "add-auth"` and broadcast `session_updated`

#### Scenario: No auto-attach when proposal already attached
- **WHEN** the server receives `openspec_activity_update` with `changeName: "other-change"` for a session with `attachedProposal = "add-auth"`
- **THEN** the server SHALL NOT change `attachedProposal`

#### Scenario: No auto-attach when only phase detected
- **WHEN** the server receives `openspec_activity_update` with `phase: "explore"` but no `changeName` for a session with `openspecChange = null`
- **THEN** the server SHALL NOT set `attachedProposal`

#### Scenario: No auto-attach when only changeName detected
- **WHEN** the server receives `openspec_activity_update` with `changeName: "add-auth"` but no `phase` for a session with `openspecPhase = null`
- **THEN** the server SHALL NOT set `attachedProposal`

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
