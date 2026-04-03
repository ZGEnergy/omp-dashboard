## REMOVED Requirements

### Requirement: User state JSON file persistence
**Reason**: `state.json` is eliminated. Its contents are split: `hiddenSessions` moves to per-session `.meta.json` files (hidden field), `pinnedDirectories` and `sessionOrder` move to `~/.pi/dashboard/preferences.json`.
**Migration**: Automatic migration on first startup reads `state.json`, distributes hidden flags to `.meta.json` files, writes global preferences to `preferences.json`, and renames `state.json` to `state.json.bak`.
