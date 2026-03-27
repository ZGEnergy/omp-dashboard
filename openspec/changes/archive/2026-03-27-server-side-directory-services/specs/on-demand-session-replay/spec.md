## MODIFIED Requirements

### Requirement: On-demand session loading via server
When a browser subscribes to a session whose events are not in memory, the server SHALL load the session directly from pi's session file on disk using `SessionManager.open(sessionFile).getBranch()`, without routing through a bridge.

#### Scenario: Browser subscribes to evicted session
- **WHEN** a browser subscribes to session "abc" whose events are not in memory, and the session has a `sessionFile` path
- **THEN** the server SHALL send an immediate `event_replay { events: [], isLast: false }` to the browser, load the session file directly via `SessionManager.open(sessionFile).getBranch()`, convert entries via `replayEntriesAsEvents()`, store in the event buffer, and send `event_replay { events, isLast: true }` to the browser

#### Scenario: Session file unavailable
- **WHEN** a browser subscribes to a session whose `sessionFile` does not exist, is corrupted, or is not set
- **THEN** the server SHALL send `event_replay { events: [], isLast: true }` and `session_updated { dataUnavailable: true }`

#### Scenario: Multiple browsers subscribe to same evicted session
- **WHEN** two browsers subscribe to the same evicted session before the load completes
- **THEN** the server SHALL deduplicate the load and deliver loaded events to both browsers

## REMOVED Requirements

### Requirement: On-demand session loading via bridge
**Reason**: Server loads session files directly, removing the bridge as intermediary. `load_session_events`, `load_session_events_result`, and `load_session_events_error` protocol messages are removed.
**Migration**: Server imports `SessionManager` and reads session files directly. No bridge involvement needed.

### Requirement: Pending load tracking
**Reason**: Bridge-mediated load tracking (timeout, bridge disconnect handling) is no longer needed. Server reads files synchronously/locally. Simple dedup via a Set of in-progress session IDs suffices.
**Migration**: `pending-load-manager.ts` removed. Replaced by simple dedup logic in `DirectoryService` or inline in `browser-gateway.ts`.
