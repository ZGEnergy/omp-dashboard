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

### Requirement: Package card reflects install state immediately
After a package install, remove, or update operation completes successfully, ALL instances of the installed packages list SHALL refresh automatically. The `useInstalledPackages` hook SHALL listen for `pi-package-event` DOM events and re-fetch the installed packages list when any operation completes with `success: true`.

#### Scenario: Install from browse updates card to installed state
- **WHEN** a package is installed via the Browse Packages section
- **THEN** the PackageCard for that package immediately shows "Installed" status
- **AND** no manual page refresh is required

#### Scenario: Uninstall updates card to uninstalled state
- **WHEN** a package is uninstalled from the Installed Packages section
- **THEN** the PackageCard in Browse Packages immediately shows the Install button
- **AND** no manual page refresh is required

#### Scenario: Cross-component state sync
- **WHEN** an install operation is triggered by one component (e.g., GlobalPackagesSection)
- **THEN** other components using `useInstalledPackages` (e.g., PackageBrowser) also update
