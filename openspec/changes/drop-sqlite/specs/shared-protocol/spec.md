## ADDED Requirements

### Requirement: Load session events protocol messages
The shared protocol SHALL define new message types for on-demand session loading between server and bridge extension.

Server → Extension:
- `load_session_events`: request to load a session file and replay its events. Fields: `sessionId` (string), `sessionFile` (string).

Extension → Server:
- `load_session_events_result`: contains all loaded events for the requested session. Fields: `sessionId` (string), `events` (array of `{ eventType, timestamp, data }`).
- `load_session_events_error`: signals that loading failed. Fields: `sessionId` (string), `error` (string).

#### Scenario: Message type definitions
- **WHEN** the protocol types are compiled
- **THEN** `LoadSessionEventsMessage`, `LoadSessionEventsResultMessage`, and `LoadSessionEventsErrorMessage` SHALL be valid TypeScript interfaces with the specified fields

#### Scenario: Union type inclusion for server-to-extension
- **WHEN** `ServerToExtensionMessage` union is checked
- **THEN** it SHALL include `LoadSessionEventsMessage`

#### Scenario: Union type inclusion for extension-to-server
- **WHEN** `ExtensionToServerMessage` union is checked
- **THEN** it SHALL include `LoadSessionEventsResultMessage` and `LoadSessionEventsErrorMessage`

### Requirement: Session data unavailability flag
The `DashboardSession` type SHALL include an optional `dataUnavailable` boolean field. When a browser subscribes to a session whose events cannot be loaded (no bridge available or load timeout), the server SHALL send a `session_updated` with `{ dataUnavailable: true }`.

#### Scenario: Data unavailable broadcast
- **WHEN** a browser subscribes to an evicted session and no bridge is available
- **THEN** the server SHALL send `session_updated` with `{ dataUnavailable: true }` so the browser can show an appropriate indicator

#### Scenario: Data unavailable on load timeout
- **WHEN** an on-demand load request times out after 10 seconds
- **THEN** the server SHALL send `session_updated` with `{ dataUnavailable: true }` to all waiting browsers

#### Scenario: Data becomes available
- **WHEN** a bridge connects and replays events for a previously unavailable session
- **THEN** the server SHALL send `session_updated` with `{ dataUnavailable: false }`
