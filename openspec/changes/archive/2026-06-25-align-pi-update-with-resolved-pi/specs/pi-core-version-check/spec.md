## MODIFIED Requirements

### Requirement: Core package update execution

The server SHALL execute a core-package update on demand. For the **pi package**, the server SHALL delegate to the resolved pi's own updater (`<resolvedPiArgv> update --self` or `--all`) rather than running `npm install -g <pi-pkg>@latest`. For the **dashboard package** (`@blackbelt-technology/pi-agent-dashboard`), which has no `pi update` equivalent, the server SHALL run an npm install only when the detected install layout supports it, otherwise surface the layout-appropriate manual instruction. Updates SHALL serialize through the existing busy lock.

#### Scenario: Update pi via resolved pi self-update
- **WHEN** an update is requested for the pi package
- **THEN** the server SHALL spawn the resolved pi argv followed by `update --self`
- **AND** SHALL NOT spawn `npm install -g <pi-pkg>@latest`
- **AND** SHALL stream child stdout/stderr to update-progress events

#### Scenario: Update pi and extensions together
- **WHEN** an "all" update is requested
- **THEN** the server SHALL spawn the resolved pi argv followed by `update --all`

#### Scenario: pi self-update declined → in-place fallback
- **WHEN** `pi update --self` exits with the self-update-unavailable message
- **AND** the resolved install prefix is writable
- **THEN** the server SHALL run the prefix's package-manager install of `<pkg>@latest` at that prefix
- **AND** report success on exit 0

#### Scenario: pi self-update declined → read-only install
- **WHEN** `pi update --self` is declined AND the resolved install path is not writable
- **THEN** the server SHALL return an instruction naming the read-only location and SHALL NOT report success

#### Scenario: Update dashboard package on npm-global layout
- **WHEN** an update is requested for `@blackbelt-technology/pi-agent-dashboard`
- **AND** `detectInstallLayout()` returns `npm-global`
- **THEN** the server SHALL run `npm install -g @blackbelt-technology/pi-agent-dashboard`

#### Scenario: Update dashboard package refused on electron/monorepo layout
- **WHEN** an update is requested for the dashboard package
- **AND** `detectInstallLayout()` returns `electron` or `monorepo`
- **THEN** the server SHALL NOT run npm
- **AND** SHALL return `suggestedReinstallCommand()` as the instruction

#### Scenario: Concurrent operation blocked
- **WHEN** an update is requested while another package operation is in progress
- **THEN** the server SHALL reject with a busy error and SHALL NOT start a second operation

### Requirement: Version status REST endpoint

The server SHALL expose the pi-core version status endpoint returning all discovered core packages, their versions, and update availability. The **pi package's version SHALL be read from the resolved pi install** (`ToolRegistry.resolveExecutor("pi")` → realpath → `package.json`), so the reported version matches the spawned binary. Each package entry SHALL include `updatable` (whether the dashboard can perform the update) and, when not updatable, a `manualAction` instruction string.

#### Scenario: pi version reflects resolved install
- **WHEN** a client requests pi-core status
- **THEN** the pi package entry's `currentVersion` SHALL equal the version in the resolved pi install's `package.json`

#### Scenario: Non-updatable package carries a manual action
- **WHEN** a discovered package cannot be updated by the dashboard (e.g. source/electron install)
- **THEN** its entry SHALL set `updatable: false`
- **AND** SHALL include a `manualAction` string describing how to update it manually

## ADDED Requirements

### Requirement: Status carries the resolved-pi install classification

The pi-core status SHALL include, for the pi row, the classification of the bridge-resolved install so clients can render the correct affordance WITHOUT first attempting (and failing) an update. Fields: `updateMethod` (`pi-self` | `npm` | `pnpm` | `yarn` | `bun`), `updateScope` (`global` | `local`), `updatable` (boolean), and `manualAction` (instruction string when not updatable). These derive from the realpath'd resolved pi.

#### Scenario: Local writable install is updatable
- **WHEN** the resolved pi is a writable local/managed install
- **THEN** the pi row SHALL report `updatable: true` and a local `updateMethod`/`updateScope`

#### Scenario: Transient / read-only install is not updatable
- **WHEN** the resolved pi is npx/bunx, a bun binary, Homebrew, a git checkout, or a read-only bundle
- **THEN** the pi row SHALL report `updatable: false` with a class-specific `manualAction`

## REMOVED Requirements

### Requirement: pi-core-updater resolves npm via ToolRegistry and inherits managed Node on PATH

**Reason**: The pi package no longer updates through `npm install`; it delegates to the resolved pi's own `pi update`. The ToolRegistry-resolved-npm + managed-Node-PATH contract no longer applies to the pi package's update path.

**Migration**: pi-package updates now run `<resolvedPiArgv> update --self|--all`; pi owns binary/install-method resolution internally. The dashboard package (the only remaining npm-driven core update) continues to resolve npm via ToolRegistry as part of the dashboard-package update path; that behavior moves under the `Core package update execution` requirement above.
