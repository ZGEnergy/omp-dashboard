## ADDED Requirements

### Requirement: Workspace JSON file persistence
Workspaces SHALL be persisted in `~/.pi/dashboard/workspaces.json` as a JSON array. The file SHALL be read on server startup and written atomically on every mutation (create, update, delete).

#### Scenario: Read workspaces on startup
- **WHEN** the server starts and `workspaces.json` exists
- **THEN** the server SHALL load all workspace records from the file

#### Scenario: Read workspaces when file missing
- **WHEN** the server starts and `workspaces.json` does not exist
- **THEN** the server SHALL start with an empty workspace list

#### Scenario: Read workspaces when file is malformed
- **WHEN** the server starts and `workspaces.json` contains invalid JSON
- **THEN** the server SHALL log a warning and start with an empty workspace list

#### Scenario: Atomic write on mutation
- **WHEN** a workspace is created, updated, or deleted
- **THEN** the server SHALL write the full workspace array to a temporary file and rename it to `workspaces.json` to prevent corruption

### Requirement: User state JSON file persistence
User preferences SHALL be persisted in `~/.pi/dashboard/state.json`. The file SHALL contain a JSON object with at minimum a `hiddenSessions` array of session IDs.

#### Scenario: Read state on startup
- **WHEN** the server starts and `state.json` exists
- **THEN** the server SHALL load the hidden session IDs and apply them to the in-memory session registry

#### Scenario: Read state when file missing
- **WHEN** the server starts and `state.json` does not exist
- **THEN** the server SHALL start with no hidden sessions

#### Scenario: Persist hidden session change
- **WHEN** a user hides or unhides a session
- **THEN** the server SHALL update `state.json` with the current set of hidden session IDs

#### Scenario: Debounced writes
- **WHEN** multiple hide/unhide actions occur within one second
- **THEN** the server SHALL coalesce them into a single file write

#### Scenario: Atomic write
- **WHEN** state is persisted to disk
- **THEN** the server SHALL write to a temporary file and rename to `state.json`
