## MODIFIED Requirements

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
