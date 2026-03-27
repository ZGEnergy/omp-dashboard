## Purpose

**DEPRECATED** — Session history sync has moved from the bridge extension to the dashboard server. See `server-session-reader` for the replacement capability.

Previously, the bridge extension called `SessionManager.list(cwd)` on connect and sent results via `session_history_sync` protocol message. This was replaced by server-side direct disk discovery via `DirectoryService.discoverSessions(cwd)` to eliminate bridge dependency and enable zero-session directory visibility.
