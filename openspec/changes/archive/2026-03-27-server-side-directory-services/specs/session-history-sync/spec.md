## REMOVED Requirements

### Requirement: Bridge sends local session history on connect
**Reason**: Server reads session history directly via `SessionManager.list(cwd)` import, eliminating bridge dependency.
**Migration**: Server's `DirectoryService` calls `SessionManager.list(cwd)` on startup and when new directories are discovered. `session_history_sync` protocol message removed.

### Requirement: Server deduplicates and inserts historical sessions
**Reason**: Deduplication logic moves to `DirectoryService` which calls `SessionManager.list()` directly. Same behavior, different trigger.
**Migration**: Server still deduplicates by session ID and inserts with `status: "ended", hidden: true`. Logic moves from `session_history_sync` message handler to `DirectoryService.discoverSessions(cwd)`.
