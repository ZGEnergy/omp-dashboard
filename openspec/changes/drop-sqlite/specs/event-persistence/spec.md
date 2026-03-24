## REMOVED Requirements

### Requirement: SQLite event store
**Reason**: Replaced by in-memory event buffer. Pi session files on disk are the true source of truth; SQLite was a redundant cache.
**Migration**: Events are served from in-memory buffer, loaded on demand from pi session files via bridge.

### Requirement: Per-session sequence numbers
**Reason**: Sequence numbers are now assigned by the in-memory event buffer instead of SQLite.
**Migration**: Same interface, different backing store. No consumer changes needed.

### Requirement: Event replay for reconnection
**Reason**: Event replay is now served from the in-memory buffer instead of SQLite.
**Migration**: Same `event_replay` protocol. Browser reconnection logic unchanged.

### Requirement: Content split for lazy loading
**Reason**: Content is now fetched from the in-memory buffer instead of SQLite.
**Migration**: Same `fetch_content` / `GET /api/events/:sessionId/:seq` API, backed by in-memory store.

### Requirement: 30-day retention policy
**Reason**: No longer needed. In-memory buffer uses LRU eviction. Pi session files on disk have their own lifecycle managed by pi.
**Migration**: None needed. Old events are evicted by LRU when memory limit is reached.

### Requirement: Session persistence
**Reason**: Sessions are now purely in-memory, hydrated from bridge connections. Hidden session state persisted in JSON file.
**Migration**: Sessions appear as bridges connect. Historical sessions appear via `session_history_sync`.

### Requirement: Workspace persistence
**Reason**: Moved from SQLite to JSON file (`~/.pi/dashboard/workspaces.json`).
**Migration**: See `json-file-persistence` spec.

### Requirement: OpenSpec data persistence
**Reason**: OpenSpec data is now held in memory only, refreshed from bridge on connect. Stale data after server restart is acceptable — bridge will send fresh data on reconnect.
**Migration**: None needed. Browser receives openspec_update from bridge after subscribe triggers refresh.

### Requirement: Database migrations
**Reason**: No database, no migrations needed.
**Migration**: None.
