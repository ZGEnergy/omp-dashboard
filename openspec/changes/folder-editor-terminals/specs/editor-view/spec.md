## ADDED Requirements

### Requirement: code-server iframe embedding
The EditorView SHALL embed code-server in an iframe using the reverse-proxied path `/editor/:id/`. The iframe SHALL fill the entire content area. The iframe SHALL have `allow="clipboard-read; clipboard-write"` for clipboard integration.

#### Scenario: Editor loaded successfully
- **WHEN** a code-server instance is running and ready for the folder
- **THEN** the EditorView SHALL render an iframe with `src="/editor/:id/"`
- **THEN** the iframe SHALL fill the available content area
- **THEN** clipboard operations SHALL work between the iframe and the host page

### Requirement: Lazy start on first open
When the EditorView is opened for a folder with no running code-server instance, it SHALL request the server to start one. A loading spinner SHALL be shown during startup (typically 2-5 seconds).

#### Scenario: First open triggers start
- **WHEN** user navigates to EditorView for a folder with no running instance
- **THEN** the client SHALL call `POST /api/editor/start` with `{ cwd }`
- **THEN** a loading spinner SHALL be displayed
- **WHEN** the server responds with `{ id, status: "ready" }`
- **THEN** the iframe SHALL load the editor

#### Scenario: Instance already running
- **WHEN** user navigates to EditorView for a folder with a running instance
- **THEN** the iframe SHALL load immediately without a loading state

### Requirement: Heartbeat for idle tracking
While the EditorView is visible, it SHALL send a heartbeat POST to `/api/editor/:id/heartbeat` every 30 seconds. When the user navigates away from the EditorView, heartbeats SHALL stop.

#### Scenario: Heartbeat while visible
- **WHEN** the EditorView is mounted and visible
- **THEN** it SHALL send `POST /api/editor/:id/heartbeat` every 30 seconds

#### Scenario: Heartbeat stops on navigation
- **WHEN** the user navigates away from the EditorView to a ChatView
- **THEN** heartbeats SHALL stop
- **THEN** the server's idle timer SHALL begin counting

### Requirement: Error and install guide states
When the server reports code-server binary is not found, the EditorView SHALL display an install guide (EditorInstallGuide) with platform-specific installation instructions. When a running instance crashes, it SHALL show an error state with a retry button.

#### Scenario: code-server not installed
- **WHEN** the server responds to start with `{ error: "binary_not_found" }`
- **THEN** the EditorView SHALL display the EditorInstallGuide
- **THEN** the guide SHALL show installation commands for the current platform

#### Scenario: Instance crashed
- **WHEN** the server broadcasts that an editor instance has stopped unexpectedly
- **THEN** the EditorView SHALL show an error message and a "Restart" button
- **WHEN** user clicks Restart
- **THEN** a new start request SHALL be sent

### Requirement: Folder path header
The EditorView SHALL display the folder's absolute path in a header above the iframe.

#### Scenario: Header shows folder path
- **WHEN** the EditorView is displayed for `/Users/robson/Project/foo`
- **THEN** a header SHALL show the path
