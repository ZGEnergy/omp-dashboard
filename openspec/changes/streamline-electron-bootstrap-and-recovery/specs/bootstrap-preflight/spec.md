## ADDED Requirements

### Requirement: Per-launch inventory check
On every Electron app launch where the dashboard server is not reachable, the Electron main process SHALL read the installed `package.json#version` of every package in the managed-package whitelist from `~/.pi-dashboard/node_modules/<pkg>/package.json` and compare against the pin versions declared in `packages/electron/offline-packages.json` (or the equivalent runtime manifest at `resources/offline-packages/manifest.json`).

#### Scenario: All packages current
- **WHEN** every whitelisted package's installed version equals the pinned version
- **THEN** the inventory diff SHALL have `needsAction: false`
- **AND** no reinstall prompt SHALL appear
- **AND** the server launch SHALL proceed

#### Scenario: Package missing from managed dir
- **WHEN** `@earendil-works/pi-coding-agent/package.json` is absent
- **THEN** the diff entry SHALL classify as `missing`
- **AND** `needsAction` SHALL be true

#### Scenario: Package version stale
- **WHEN** installed pi version is `0.69.0` and pinned version is `0.70.5`
- **THEN** the diff entry SHALL classify as `stale`
- **AND** `needsAction` SHALL be true

#### Scenario: Package package.json corrupt
- **WHEN** `~/.pi-dashboard/node_modules/<pkg>/package.json` exists but does not parse as JSON
- **THEN** the diff entry SHALL classify as `corrupt`
- **AND** `needsAction` SHALL be true

### Requirement: Selective reinstall on user consent
When the inventory diff indicates `needsAction: true` and the managed directory is populated (not first-run), the Electron main process SHALL prompt the user with a dialog enumerating the affected packages and offer "Reinstall" / "Skip" actions. On "Reinstall", `installStandalone()` SHALL be invoked with `skipPackages` set to the entries classified as `current`, ensuring only affected packages are reinstalled.

#### Scenario: Single stale package, user accepts
- **WHEN** only `@fission-ai/openspec` is stale and the user clicks "Reinstall"
- **THEN** `installStandalone` SHALL be called with `skipPackages = ["@earendil-works/pi-coding-agent", "tsx"]`
- **AND** only `@fission-ai/openspec` SHALL be reinstalled

#### Scenario: User skips reinstall
- **WHEN** the user clicks "Skip"
- **THEN** no reinstall SHALL occur
- **AND** the server launch SHALL proceed regardless

#### Scenario: Silent bootstrap env override
- **WHEN** the environment variable `PI_DASHBOARD_SILENT_BOOTSTRAP=1` is set and `needsAction: true`
- **THEN** the dialog SHALL NOT appear
- **AND** the reinstall SHALL proceed automatically with the affected-only skip-list

### Requirement: First-run vs reconcile branching
The preflight check SHALL distinguish between an empty managed directory (first-run, route to wizard) and a populated-but-stale managed directory (reconcile, prompt to reinstall). The decision SHALL be based on filesystem state, not on the presence or absence of `mode.json`.

#### Scenario: Empty managed dir routes to wizard
- **WHEN** `~/.pi-dashboard/node_modules/` contains no whitelisted-package directories
- **THEN** the preflight SHALL classify as first-run
- **AND** the wizard SHALL open

#### Scenario: Populated managed dir routes to reconcile
- **WHEN** `~/.pi-dashboard/node_modules/` contains at least one whitelisted-package directory (any version)
- **THEN** the preflight SHALL classify as reconcile
- **AND** the wizard SHALL NOT open even if `needsAction: true`

### Requirement: Cross-version notification
When the dashboard server is reachable, the Electron main process SHALL compare the server's reported version (from `/api/health`) against `app.getVersion()` and SHALL surface a banner in the main window for the following cases:
- **Running newer than app:** banner with copy "Running dashboard is newer than this Electron app (server vX.Y.Z, app vA.B.C). Using the running server." Non-blocking; dismissible per session.
- **Running older than app:** banner with copy "Running dashboard is older than this Electron app (server vA.B.C, app vX.Y.Z). Restart server for new features?" with a `[Restart server]` action that invokes `requestServerLaunch({force: true})`.

#### Scenario: Versions match
- **WHEN** server version equals app version
- **THEN** no banner SHALL appear

#### Scenario: Running newer than app
- **WHEN** server version is `0.6.0` and app version is `0.5.3`
- **THEN** the "newer" banner SHALL appear
- **AND** dismissing it SHALL persist the dismissal for the current session only

#### Scenario: Running older than app
- **WHEN** server version is `0.5.0` and app version is `0.5.3`
- **THEN** the "older" banner SHALL appear with a Restart action
- **AND** clicking Restart SHALL invoke `requestServerLaunch({force: true})`

### Requirement: Preflight performance
The preflight inventory read SHALL complete within 500ms on a cold filesystem cache and within 100ms on a warm cache. Implementation SHALL avoid spawning subprocesses (no `npm list`, no `node --version`) and rely exclusively on `fs.readFileSync` of `package.json` files.

#### Scenario: Pure-IO implementation
- **WHEN** `readManagedInventory` is called
- **THEN** no child process SHALL be spawned
- **AND** no network call SHALL be made
- **AND** only `fs.readFileSync` (or equivalent sync read) of each whitelist entry's `package.json` SHALL occur
