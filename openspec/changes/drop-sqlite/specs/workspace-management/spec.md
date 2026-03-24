## MODIFIED Requirements

### Requirement: Workspace CRUD operations
The system SHALL support creating, reading, updating, and deleting workspaces via the REST API. Each workspace represents a project folder on the host machine.

A workspace SHALL have: id (uuid), name (display name), path (absolute folder path), sortOrder (integer), createdAt (timestamp).

Storage SHALL be a JSON file (`~/.pi/dashboard/workspaces.json`) instead of SQLite. The file SHALL be read on startup and written atomically on every mutation.

#### Scenario: Create workspace
- **WHEN** a user submits a new workspace with name "api-server" and path "/home/user/projects/api-server"
- **THEN** the system SHALL create a workspace record, validate the path exists on disk, write the updated list to `workspaces.json`, and return the created workspace

#### Scenario: Create workspace with non-existent path
- **WHEN** a user submits a workspace with a path that does not exist on disk
- **THEN** the system SHALL return an error indicating the path is invalid

#### Scenario: Create workspace with duplicate path
- **WHEN** a user submits a workspace with a path that matches an existing workspace
- **THEN** the system SHALL return an error indicating a workspace already exists for that path

#### Scenario: Delete workspace
- **WHEN** a user deletes a workspace
- **THEN** the system SHALL remove the workspace record, write the updated list to `workspaces.json`, and sessions SHALL become unassigned

#### Scenario: Update workspace name
- **WHEN** a user renames a workspace from "api" to "API Server"
- **THEN** the system SHALL update the name, write to `workspaces.json`, and broadcast `workspace_updated` to connected browsers

#### Scenario: Reorder workspaces
- **WHEN** a user changes workspace sort order
- **THEN** the system SHALL update sortOrder values, write to `workspaces.json`, and the workspace bar SHALL reflect the new order

#### Scenario: Workspaces survive server restart
- **WHEN** the server restarts
- **THEN** all workspace records SHALL be loaded from `workspaces.json`
