## ADDED Requirements

### Requirement: Folder terminals route
The client SHALL define a route `/folder/:encodedCwd/terminals` that displays the TerminalsView for the decoded folder path. The `encodedCwd` SHALL be base64url-encoded.

#### Scenario: Navigate to folder terminals
- **WHEN** user navigates to `/folder/:encodedCwd/terminals`
- **THEN** the TerminalsView SHALL be displayed for the decoded cwd
- **THEN** the folder group SHALL be visually indicated in the sidebar

#### Scenario: Invalid encoded cwd
- **WHEN** user navigates to `/folder/invalid-base64/terminals`
- **THEN** the app SHALL redirect to `/`

### Requirement: Folder editor route
The client SHALL define a route `/folder/:encodedCwd/editor` that displays the EditorView for the decoded folder path.

#### Scenario: Navigate to folder editor
- **WHEN** user navigates to `/folder/:encodedCwd/editor`
- **THEN** the EditorView SHALL be displayed for the decoded cwd

## REMOVED Requirements

### Requirement: Terminal route
**Reason**: The `/terminal/:id` route is replaced by `/folder/:encodedCwd/terminals` which shows all terminals for a folder in a tabbed view.
**Migration**: Terminal access is now through the folder-scoped TerminalsView. Navigate to `/folder/:encodedCwd/terminals` instead.
