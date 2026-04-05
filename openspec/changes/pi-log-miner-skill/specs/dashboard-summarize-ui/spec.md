## ADDED Requirements

### Requirement: Summarize button on session cards
The dashboard SHALL show a "Summarize" action in the session card kebab menu for both ended sessions and active sessions.

#### Scenario: Ended session
- **WHEN** a session has `status: "ended"` and the user opens the kebab menu
- **THEN** a "Summarize" option is visible

#### Scenario: Active session
- **WHEN** a session has `status: "streaming"` or `status: "idle"` and the user opens the kebab menu
- **THEN** a "Summarize" option is visible (produces partial "in-progress" summary)

#### Scenario: Summary already exists
- **WHEN** a session already has a completed summary
- **THEN** the menu shows "Re-analyze" instead of "Summarize"

### Requirement: Summarize action in session header
The session header actions SHALL include a summarize/re-analyze button matching the kebab menu behavior.

#### Scenario: User clicks summarize in header
- **WHEN** the user clicks the summarize button in the session header
- **THEN** the system triggers `POST /api/session/:id/summarize`

### Requirement: Background pipeline with progress tracking
The summarize action SHALL trigger a background pipeline via `POST /api/session/:id/summarize`. The server SHALL emit WebSocket progress events during processing.

#### Scenario: Pipeline started
- **WHEN** the user triggers summarization
- **THEN** the server returns `{ success: true, taskId: "..." }` and begins processing in the background

#### Scenario: Progress events
- **WHEN** the pipeline processes chunk 3 of 12 on topic "Auth Refactoring"
- **THEN** the server emits `{ type: "summary_progress", sessionId, chunk: 3, total: 12, currentTopic: "Auth Refactoring" }` to subscribed browsers

#### Scenario: Pipeline completion
- **WHEN** the pipeline finishes all chunks
- **THEN** the server emits `{ type: "summary_complete", sessionId }` to subscribed browsers

### Requirement: Summary status endpoint
The server SHALL provide `GET /api/session/:id/summary` returning the summary status and content.

#### Scenario: Summary ready
- **WHEN** a summary has been generated for the session
- **THEN** the endpoint returns `{ status: "ready", summary: "..." }` with the markdown content

#### Scenario: Summary in progress
- **WHEN** the pipeline is currently processing
- **THEN** the endpoint returns `{ status: "processing", progress: { chunk: 3, total: 12 } }`

#### Scenario: No summary exists
- **WHEN** no summary has been generated
- **THEN** the endpoint returns `{ status: "none" }`

### Requirement: Summary content-area view
The dashboard SHALL display session summaries in a content-area view with collapsible topic sections, colored badges for surprises (amber) and contradictions (red), and a re-analyze button.

#### Scenario: User opens summary view
- **WHEN** the user clicks on a completed summary indicator or navigates to the summary view
- **THEN** the content area shows the rendered markdown summary with collapsible topic sections

#### Scenario: Re-analyze button
- **WHEN** the session has new activity since the last summary
- **THEN** a "Re-analyze" button is shown with a staleness indicator

### Requirement: Honcho status indicator
The dashboard settings or footer SHALL show the Honcho connection state: "Docker running", "External", or "Offline".

#### Scenario: Docker Honcho running
- **WHEN** the Docker-managed Honcho stack is healthy
- **THEN** the indicator shows "Docker running" with a green status

#### Scenario: Honcho offline
- **WHEN** Honcho is unavailable
- **THEN** the indicator shows "Offline" with a dim status
