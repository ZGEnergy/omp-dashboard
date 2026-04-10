## MODIFIED Requirements

### Requirement: Electron mode forces headless spawn
When the server detects it was launched by an Electron app (via `electronMode` config flag), the spawn strategy SHALL be forced to `"headless"` regardless of the configured `spawnStrategy`, and tmux detection SHALL be skipped entirely.

#### Scenario: Electron mode forces headless
- **WHEN** `electronMode` is `true` in the server config
- **THEN** `spawnPiSession` SHALL use `"headless"` strategy regardless of `spawnStrategy` config
- **AND** SHALL NOT attempt tmux detection

### Requirement: Managed install PATH augmentation
When spawning pi sessions, the process manager SHALL prepend `~/.pi-dashboard/node_modules/.bin` to the spawned process's `PATH` environment variable so managed-install pi is discoverable.

#### Scenario: Managed pi on PATH for spawned sessions
- **WHEN** `spawnPiSession` spawns a process
- **THEN** the spawned process's `PATH` SHALL include `~/.pi-dashboard/node_modules/.bin`
