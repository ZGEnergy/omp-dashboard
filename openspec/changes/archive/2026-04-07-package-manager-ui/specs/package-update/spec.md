## ADDED Requirements

### Requirement: Server updates pi packages via PackageManager
The server SHALL expose `POST /api/packages/update` accepting `{ source?, scope, cwd? }`. If `source` is provided, only that package is updated. If omitted, all packages for the given scope are updated. The endpoint SHALL return immediately with an `operationId` and stream progress via WebSocket.

#### Scenario: Update all global packages
- **WHEN** client sends `POST /api/packages/update` with `{ scope: "global" }`
- **THEN** server calls `packageManager.update()` for the global scope

#### Scenario: Update specific package
- **WHEN** client sends `POST /api/packages/update` with `{ source: "npm:pi-doom", scope: "global" }`
- **THEN** server calls `packageManager.update("npm:pi-doom")` for that specific package

### Requirement: Server lists installed packages
The server SHALL expose `GET /api/packages/installed?scope=global&cwd=<path>` that returns the list of configured packages using `packageManager.listConfiguredPackages()`.

#### Scenario: List global packages
- **WHEN** client sends `GET /api/packages/installed?scope=global`
- **THEN** server returns the list of globally installed packages with source, scope, and installed path

#### Scenario: List local packages
- **WHEN** client sends `GET /api/packages/installed?scope=local&cwd=/path/to/project`
- **THEN** server returns packages from `<cwd>/.pi/settings.json`
