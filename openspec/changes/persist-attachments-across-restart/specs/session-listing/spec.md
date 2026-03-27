## MODIFIED Requirements

### Requirement: Session registration
The server SHALL register sessions from extension connections. When a session re-registers with an ID that already exists (from persistence restore), the server SHALL merge user-set fields from the existing session into the new registration.

#### Scenario: Re-register preserves attached proposal
- **WHEN** a session with `attachedProposal: "my-change"` is restored from persistence and the extension re-registers with the same session ID
- **THEN** the new session SHALL have `attachedProposal: "my-change"`

#### Scenario: Re-register preserves user-set name
- **WHEN** a session with `name: "my-task"` is restored from persistence and the extension re-registers with the same ID without providing a name
- **THEN** the new session SHALL have `name: "my-task"`

#### Scenario: Re-register with new name from extension
- **WHEN** a session is restored from persistence with `name: "old-name"` and the extension re-registers providing `name: "new-name"`
- **THEN** the new session SHALL have `name: "new-name"` (extension-provided name takes precedence)

#### Scenario: Fresh registration without existing session
- **WHEN** a session registers with an ID that does not exist in the session map
- **THEN** the session SHALL be created normally with no merge behavior
