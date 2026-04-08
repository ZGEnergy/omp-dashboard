## ADDED Requirements

### Requirement: Server installs pi packages via PackageManager
The server SHALL expose `POST /api/packages/install` accepting `{ source, scope, cwd? }`. It SHALL use pi's `DefaultPackageManager` to install the package. For `scope: "global"` it installs to `~/.pi/agent/settings.json`. For `scope: "local"` it installs to `<cwd>/.pi/settings.json`. The endpoint SHALL return immediately with an `operationId` and stream progress via WebSocket.

#### Scenario: Install npm package globally
- **WHEN** client sends `POST /api/packages/install` with `{ source: "npm:pi-doom", scope: "global" }`
- **THEN** server calls `packageManager.installAndPersist("npm:pi-doom")` and returns `{ operationId }` with status 202

#### Scenario: Install npm package locally
- **WHEN** client sends `POST /api/packages/install` with `{ source: "npm:pi-tools", scope: "local", cwd: "/path/to/project" }`
- **THEN** server calls `packageManager.installAndPersist("npm:pi-tools", { local: true })` scoped to the given cwd

#### Scenario: Install git package
- **WHEN** client sends `POST /api/packages/install` with `{ source: "git:github.com/user/repo", scope: "global" }`
- **THEN** server installs via git clone and persists to settings

#### Scenario: Concurrent install rejected
- **WHEN** an install/remove/update operation is already running
- **THEN** server returns 409 Conflict

### Requirement: Server serializes package operations
The server SHALL allow only one package operation (install, remove, or update) at a time. Concurrent requests SHALL receive a 409 Conflict response.

#### Scenario: Second operation during active operation
- **WHEN** an install is in progress and another install request arrives
- **THEN** the second request receives 409 with message "A package operation is already in progress"
