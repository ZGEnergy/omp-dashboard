## ADDED Requirements

### Requirement: Server skips OpenSpec polling when `openspec.enabled` is false
The server SHALL gate ALL OpenSpec polling on `DashboardConfig.openspec.enabled`. When `enabled === false`:
- the per-directory poll loop SHALL not invoke `openspec list --json` or `openspec status --change <name> --json` for any directory;
- on-demand `openspec_refresh` requests from browsers SHALL be acknowledged but SHALL NOT trigger CLI invocations (the server SHALL respond as if the directory has no `openspec/` directory);
- the in-memory `OpenSpecData` cache for every known cwd SHALL be cleared (set to `{ initialized: false, pending: false, changes: [] }`) the first time the disabled state is observed by the polling loop, and the corresponding `openspec_update` SHALL be broadcast to all connected browsers so existing UIs converge to the disabled-state shape.

When `enabled` flips back to `true` via `PUT /api/config` and `directoryService.reconfigurePolling`, the server SHALL resume normal polling on the next tick (no immediate burst-poll required).

#### Scenario: No CLI spawns while disabled
- **WHEN** `DashboardConfig.openspec.enabled` is `false` for the entire poll interval
- **AND** there are 5 known directories
- **THEN** zero `openspec` CLI processes SHALL be spawned during that interval

#### Scenario: Cache cleared and broadcast on disable transition
- **WHEN** the cache contains `{ initialized: true, changes: [...non-empty...] }` for cwd `C` at time T
- **AND** `openspec.enabled` is set to `false` via `PUT /api/config` at time T+1
- **THEN** the server SHALL broadcast an `openspec_update` for cwd `C` with payload `{ initialized: false, pending: false, changes: [] }` within one poll tick
- **AND** the in-memory cache for `C` SHALL be `{ initialized: false, pending: false, changes: [] }`

#### Scenario: openspec_refresh is a no-op while disabled
- **WHEN** `openspec.enabled` is `false`
- **AND** a browser sends `openspec_refresh` with `cwd: "C"`
- **THEN** the server SHALL NOT spawn any `openspec` CLI process
- **AND** SHALL broadcast `openspec_update` with `{ initialized: false, pending: false, changes: [] }` for cwd `C`

#### Scenario: Polling resumes on re-enable
- **WHEN** `openspec.enabled` flips from `false` to `true` via `PUT /api/config`
- **THEN** the next regular poll tick SHALL evaluate every known directory normally (subject to change-detection and concurrency caps)
- **AND** the resulting `openspec_update` broadcasts SHALL reflect the actual on-disk state
