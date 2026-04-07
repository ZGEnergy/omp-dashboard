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

## MODIFIED Requirements

### Requirement: Terminal route
The `/terminal/:id` route SHALL be kept for backward compatibility but is deprecated. New terminal access SHALL use `/folder/:encodedCwd/terminals`. The legacy route SHALL continue to render the existing `TerminalView` for the selected terminal.

#### Scenario: Legacy terminal route still works
- **WHEN** user navigates to `/terminal/:id` with a valid terminal ID
- **THEN** the terminal SHALL be displayed using the existing TerminalView

#### Scenario: New terminal creation uses folder route
- **WHEN** a new terminal is created via the folder action bar
- **THEN** the app SHALL navigate to `/folder/:encodedCwd/terminals` (not `/terminal/:id`)
