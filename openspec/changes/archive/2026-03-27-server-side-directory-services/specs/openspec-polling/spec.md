## REMOVED Requirements

### Requirement: Extension polls openspec CLI periodically
**Reason**: Polling moves to the dashboard server, which polls per directory instead of per session.
**Migration**: Server's `DirectoryService` now handles all openspec CLI polling. Bridge no longer sends `openspec_update` messages.

### Requirement: Browser can request immediate refresh
**Reason**: Refresh is now handled directly by the server without routing through a bridge extension.
**Migration**: Browser sends `openspec_refresh` with `cwd` field to the server, which re-polls the CLI directly.
