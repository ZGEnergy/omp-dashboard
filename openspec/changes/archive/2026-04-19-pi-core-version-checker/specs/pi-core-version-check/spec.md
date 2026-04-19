## ADDED Requirements

### Requirement: Core package discovery
The server SHALL discover all installed pi ecosystem core packages from both global npm and the managed install directory (`~/.pi-dashboard/node_modules/`).

#### Scenario: Global npm packages discovered
- **WHEN** the server runs `npm list -g --depth=0 --json`
- **THEN** it SHALL parse the output and identify pi ecosystem packages by matching known package names (`@mariozechner/pi-coding-agent`, `@blackbelt-technology/pi-agent-dashboard`, `@blackbelt-technology/pi-model-proxy`) and packages starting with `pi-`
- **AND** each discovered package SHALL include its installed version from the JSON output

#### Scenario: Managed install packages discovered
- **WHEN** the directory `~/.pi-dashboard/node_modules/` exists
- **THEN** the server SHALL scan it for pi ecosystem packages by reading each matching `package.json`
- **AND** mark their `installSource` as `"managed"`

#### Scenario: Managed directory does not exist
- **WHEN** `~/.pi-dashboard/node_modules/` does not exist
- **THEN** the server SHALL skip managed scanning without error
- **AND** only return globally installed packages

#### Scenario: npm list command fails
- **WHEN** `npm list -g --depth=0 --json` fails or times out (30s)
- **THEN** the server SHALL log a warning and return an empty list for global packages

#### Scenario: Duplicate package in both sources
- **WHEN** a package is found in both global npm and managed install
- **THEN** the managed install version SHALL take precedence

### Requirement: Version comparison against registry
The server SHALL compare each discovered package's installed version against the latest version available on npm or GitHub.

#### Scenario: npm package version check
- **WHEN** a discovered package is an npm package
- **THEN** the server SHALL fetch its latest version via `fetchPackageMeta()` from the npm registry
- **AND** set `updateAvailable` to `true` when installed version differs from latest

#### Scenario: Registry unreachable
- **WHEN** the npm registry is unreachable for a package
- **THEN** `latestVersion` SHALL be `null` and `updateAvailable` SHALL be `false`

### Requirement: Version status caching
The server SHALL cache version status results for 5 minutes to avoid excessive registry queries.

#### Scenario: Cached result returned
- **WHEN** a version check was performed less than 5 minutes ago
- **THEN** the cached result SHALL be returned without querying the registry

#### Scenario: Force refresh
- **WHEN** `GET /api/pi-core/versions?refresh=true` is called
- **THEN** the cache SHALL be invalidated and a fresh check SHALL be performed

### Requirement: Version status REST endpoint
The server SHALL expose `GET /api/pi-core/versions` returning `PiCoreStatus` with all discovered packages, their versions, and update availability.

#### Scenario: Successful version check
- **WHEN** a client calls `GET /api/pi-core/versions`
- **THEN** the response SHALL contain `{ success: true, data: PiCoreStatus }` with `packages` array, `updatesAvailable` count, and `lastChecked` ISO timestamp

#### Scenario: No packages found
- **WHEN** no pi ecosystem packages are discovered
- **THEN** the response SHALL return an empty `packages` array with `updatesAvailable: 0`

### Requirement: Core package update execution
The server SHALL expose `POST /api/pi-core/update` to update one or more core packages.

#### Scenario: Update global package
- **WHEN** a client calls `POST /api/pi-core/update` with `{ packages: ["@mariozechner/pi-coding-agent"] }` and the package has `installSource: "global"`
- **THEN** the server SHALL run `npm update -g @mariozechner/pi-coding-agent`
- **AND** broadcast progress events via WebSocket

#### Scenario: Update managed package
- **WHEN** a package has `installSource: "managed"`
- **THEN** the server SHALL run `npm update <pkg>` in the `~/.pi-dashboard/` directory

#### Scenario: Update all packages
- **WHEN** `POST /api/pi-core/update` is called with `{ packages: [] }` or no `packages` field
- **THEN** all packages with `updateAvailable: true` SHALL be updated sequentially

#### Scenario: Concurrent operation blocked
- **WHEN** a package operation (extension install/update or core update) is already running
- **THEN** the server SHALL return 409 Conflict

#### Scenario: Permission error on global update
- **WHEN** `npm update -g` fails with a permission error
- **THEN** the error message SHALL be surfaced to the client

### Requirement: Session auto-reload after update
The server SHALL auto-reload all connected pi sessions after a successful core package update.

#### Scenario: Successful update triggers reload
- **WHEN** a core package update completes successfully
- **THEN** all connected pi sessions SHALL be reloaded
- **AND** the completion message SHALL include `sessionsReloaded` count

### Requirement: Display name mapping
Known core packages SHALL have human-readable display names.

#### Scenario: Known package has display name
- **WHEN** `@mariozechner/pi-coding-agent` is discovered
- **THEN** its `displayName` SHALL be `"pi (core agent)"`

#### Scenario: Unknown package uses npm name
- **WHEN** a discovered package has no display name mapping
- **THEN** its npm package name SHALL be used as `displayName`
