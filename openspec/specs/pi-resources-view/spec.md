## ADDED Requirements

### Requirement: Folder header navigation button
The sidebar folder header SHALL include a button to navigate to the Pi Resources view.

#### Scenario: Button presence
- **WHEN** a folder group is rendered in the sidebar
- **THEN** a Pi Resources button SHALL appear in the button row alongside [+ Session] and [+ Terminal]

#### Scenario: Button click
- **WHEN** the user clicks the Pi Resources button
- **THEN** the content area SHALL display the PiResourcesView for that folder's cwd

### Requirement: PiResourcesView content area
The dashboard SHALL display a PiResourcesView in the main content area.

#### Scenario: View layout
- **WHEN** the PiResourcesView is displayed
- **THEN** it SHALL show a header with back button and folder path
- **AND** resources SHALL be grouped into "Local", "Global", and "Packages" sections

#### Scenario: Back navigation
- **WHEN** the user clicks the back button in PiResourcesView
- **THEN** the view SHALL close and return to the previous content (chat or session view)

#### Scenario: Empty section display
- **WHEN** a scope section (local/global) has no resources of any type
- **THEN** the section SHALL display "(none)" instead of empty lists

#### Scenario: Skills display
- **WHEN** skills are present in a scope
- **THEN** each skill SHALL display its name and description (truncated if long)
- **AND** each skill SHALL have a "View" action

#### Scenario: Prompts display
- **WHEN** prompts are present in a scope
- **THEN** each prompt SHALL display its name (filename without .md) and description
- **AND** each prompt SHALL have a "View" action

#### Scenario: Extensions display
- **WHEN** extensions are present in a scope
- **THEN** each extension SHALL display its name (filename) and source info
- **AND** each extension SHALL have a "View" action

#### Scenario: Package display
- **WHEN** packages are present
- **THEN** each package SHALL show its name, source type (npm/git/local), and description
- **AND** each package's resources SHALL be listed beneath it

### Requirement: File preview navigation (stack)
Clicking "View" on a resource SHALL push a file preview onto the navigation stack.

#### Scenario: View markdown resource
- **WHEN** the user clicks "View" on a skill (SKILL.md) or prompt (.md)
- **THEN** the MarkdownPreviewView SHALL be shown with the file content rendered as markdown
- **AND** the back button SHALL return to PiResourcesView (not to chat)

#### Scenario: View TypeScript resource
- **WHEN** the user clicks "View" on an extension (.ts)
- **THEN** the MarkdownPreviewView SHALL be shown with the file content displayed as a code block

#### Scenario: Stack depth
- **WHEN** the user is in file preview (depth 2)
- **AND** clicks back
- **THEN** the PiResourcesView (depth 1) SHALL be shown
- **WHEN** the user clicks back again
- **THEN** the chat view (depth 0) SHALL be shown

### Requirement: Resource file reading
The client SHALL fetch resource files via a server endpoint.

#### Scenario: Read local resource
- **WHEN** "View" is clicked on a local resource
- **THEN** the client SHALL request the file via `GET /api/pi-resource-file?path=<absolutePath>`

#### Scenario: Read global resource
- **WHEN** "View" is clicked on a global resource (e.g., `~/.pi/agent/skills/foo/SKILL.md`)
- **THEN** the client SHALL request the file via `GET /api/pi-resource-file?path=<absolutePath>`

#### Scenario: Read package resource
- **WHEN** "View" is clicked on a package resource
- **THEN** the client SHALL request the file via `GET /api/pi-resource-file?path=<absolutePath>`

### Requirement: Periodic client polling
The client SHALL poll the server for pi resources data.

#### Scenario: Polling interval
- **WHEN** the PiResourcesView is open or a folder's resources have been fetched
- **THEN** the client SHALL poll `GET /api/pi-resources?cwd=...` every 30 seconds

#### Scenario: Loading state
- **WHEN** the initial fetch is in progress
- **THEN** the PiResourcesView SHALL show a loading indicator

#### Scenario: Error state
- **WHEN** the fetch fails
- **THEN** the PiResourcesView SHALL show an error message with retry option

### Requirement: Mobile support
The PiResourcesView SHALL work on mobile using MobileShell patterns.

#### Scenario: Mobile navigation
- **WHEN** the user navigates to PiResourcesView on mobile
- **THEN** it SHALL render as a full-screen panel with slide transition
- **AND** swipe-back gesture SHALL return to the previous view

### Requirement: Pi Resources button icon
The Pi Resources button in the folder action bar SHALL use `mdiToyBrickOutline` (or `mdiPackageVariantClosed`) from the MDI icon set instead of `mdiPuzzleOutline`.

#### Scenario: Icon displayed
- **WHEN** the folder action bar is rendered
- **THEN** the Pi Resources button SHALL display the updated icon
- **THEN** the button SHALL retain its right-aligned position in the action bar
