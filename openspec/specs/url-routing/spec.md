## ADDED Requirements

### Requirement: Route definitions
The client SHALL define routes for `/` (landing page) and `/session/:id` (session view). Any unmatched route SHALL redirect to `/`.

#### Scenario: Navigate to root
- **WHEN** user navigates to `/`
- **THEN** the landing page is displayed with the sidebar and an empty main area showing a "Select a session" hint

#### Scenario: Navigate to session route
- **WHEN** user navigates to `/session/:id` where `:id` is a valid session ID
- **THEN** that session's chat view is displayed and the session is highlighted in the sidebar

#### Scenario: Navigate to unknown route
- **WHEN** user navigates to an unrecognized path (e.g., `/foo/bar`)
- **THEN** the app redirects to `/`

### Requirement: URL-derived session selection
The selected session ID SHALL be derived from the URL path parameter, not from component state. All downstream components SHALL receive `selectedId` the same way as before.

#### Scenario: selectedId from URL
- **WHEN** the current URL is `/session/abc-123`
- **THEN** `selectedId` is `abc-123` and passed to all child components

#### Scenario: No selectedId at root
- **WHEN** the current URL is `/`
- **THEN** `selectedId` is `undefined`

### Requirement: Session selection navigates via push
Clicking a session in the sidebar SHALL navigate to `/session/:id` using push history (not replace).

#### Scenario: Click session in sidebar
- **WHEN** user clicks a session card in the sidebar
- **THEN** the browser URL changes to `/session/:id` and a new history entry is created

#### Scenario: Browser back after session selection
- **WHEN** user selects session A, then session B, then presses browser back
- **THEN** the URL returns to `/session/<sessionA-id>` and session A is displayed

### Requirement: Back navigation button
The session header SHALL display a back button that navigates to the previous history entry.

#### Scenario: Back button navigates history
- **WHEN** user clicks the back button in the session header
- **THEN** `window.history.back()` is called and the previous view is displayed

#### Scenario: Back button visibility
- **WHEN** a session is selected (URL is `/session/:id`)
- **THEN** the back button is visible in the session header

### Requirement: Deep-link session on refresh
When the page is refreshed at `/session/:id`, the app SHALL restore that session once session data arrives via WebSocket.

#### Scenario: Refresh at session URL
- **WHEN** user refreshes the page at `/session/abc-123`
- **THEN** once sessions load via WebSocket, session `abc-123` is selected and its chat is displayed

#### Scenario: Refresh at session URL with unknown ID
- **WHEN** user refreshes at `/session/unknown-id` and no session with that ID exists after sessions load
- **THEN** the app redirects to `/`

### Requirement: SPA fallback on server
The server SHALL return `index.html` for any GET request that does not match a static file, API endpoint, or WebSocket path.

#### Scenario: Server serves index.html for client routes
- **WHEN** a GET request is made to `/session/abc-123`
- **THEN** the server responds with `index.html` (HTTP 200)

#### Scenario: Server still serves static files
- **WHEN** a GET request is made to `/assets/main.js`
- **THEN** the server responds with the actual static file

### Requirement: Mobile depth includes settings and tunnel routes
The mobile `MobileShell` depth calculation SHALL treat `/settings` and `/tunnel-setup` as depth-1 routes, alongside `/session/:id` and `/terminal/:id`.

#### Scenario: Settings route sets mobile depth to 1
- **WHEN** the current URL is `/settings` on a mobile viewport
- **THEN** `MobileShell` depth SHALL be 1 and the detail panel SHALL display the Settings page

#### Scenario: Tunnel setup route sets mobile depth to 1
- **WHEN** the current URL is `/tunnel-setup` on a mobile viewport
- **THEN** `MobileShell` depth SHALL be 1 and the detail panel SHALL display the Zrok Install Guide

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

### Requirement: Legacy terminal route
The `/terminal/:id` route SHALL be kept for backward compatibility but is deprecated. New terminal access SHALL use `/folder/:encodedCwd/terminals`. The legacy route SHALL continue to render the existing TerminalView for the selected terminal.

#### Scenario: Legacy terminal route still works
- **WHEN** user navigates to `/terminal/:id` with a valid terminal ID
- **THEN** the terminal SHALL be displayed using the existing TerminalView

#### Scenario: New terminal creation uses folder route
- **WHEN** a new terminal is created via the folder action bar
- **THEN** the app SHALL navigate to `/folder/:encodedCwd/terminals` (not `/terminal/:id`)
