## MODIFIED Requirements

### Requirement: Settings panel version section

The Pi Ecosystem settings panel SHALL render the three sub-groups (Core / Recommended Extensions / Other) with per-row version, update availability, and a per-row Update action. The per-row Update action SHALL delegate to the resolved pi's updater: the **pi row** runs `pi update --self`; each **extension row** runs `pi update --extension <source>`. A row whose package is not updatable by the dashboard SHALL render a non-clickable `manual`/`Locked` state with the package's `manualAction` instruction.

#### Scenario: pi row update delegates to self-update
- **WHEN** the user clicks Update on the pi row
- **THEN** the dashboard SHALL trigger `pi update --self` on the resolved pi
- **AND** SHALL show in-progress state on that row

#### Scenario: Extension row update delegates to per-extension update
- **WHEN** the user clicks Update on an extension row with source `<source>`
- **THEN** the dashboard SHALL trigger `pi update --extension <source>`

#### Scenario: Non-updatable row shows manual instruction
- **WHEN** a row's package reports `updatable: false`
- **THEN** the row SHALL render a non-clickable `manual`/`Locked` control
- **AND** SHALL display the package's `manualAction` text

#### Scenario: Package up to date
- **WHEN** a package has no update available
- **THEN** the row SHALL show an "up to date" indication and SHALL NOT render an Update action

### Requirement: Header update badge

The Pi Ecosystem panel header SHALL display an update indicator (count badge plus status dot) **only when at least one update is available**, and SHALL hide the indicator when all packages are current. The indicator SHALL be the at-a-glance signal that updates exist without opening the panel.

#### Scenario: Indicator visible with count
- **WHEN** one or more packages have updates available
- **THEN** the header SHALL show the update count badge and a status dot

#### Scenario: Indicator hidden when current
- **WHEN** all packages are up to date
- **THEN** the header SHALL show neither the count badge nor the status dot

## ADDED Requirements

### Requirement: Panel-header Update-all control

The Pi Ecosystem panel header SHALL provide an **Update all** split control that delegates to the resolved pi's `pi update`. The control SHALL render **only when at least one update is available** (`updatableCount > 0`) and SHALL be absent — not merely disabled/greyed — when nothing is updatable. The primary action SHALL run `pi update --all` (pi + extensions). A dropdown SHALL offer "Update pi only" (`pi update --self`) and "Update extensions only" (`pi update --extensions`).

#### Scenario: Control hidden when nothing to update
- **WHEN** no package has an available update
- **THEN** the Update-all control SHALL NOT be rendered (no disabled control)

#### Scenario: Control visible when updates exist
- **WHEN** at least one package has an available update
- **THEN** the Update-all split control SHALL render in the panel header

#### Scenario: Primary action updates pi and extensions
- **WHEN** the user clicks the primary Update-all button
- **THEN** the dashboard SHALL run `pi update --all` on the resolved pi

#### Scenario: Dropdown — pi only
- **WHEN** the user selects "Update pi only" from the dropdown
- **THEN** the dashboard SHALL run `pi update --self`

#### Scenario: Dropdown — extensions only
- **WHEN** the user selects "Update extensions only" from the dropdown
- **THEN** the dashboard SHALL run `pi update --extensions`

#### Scenario: Degraded control when only pi self-update is blocked
- **WHEN** updates exist for extensions but the resolved pi cannot self-update
- **THEN** the primary control SHALL run the extensions update (`pi update --extensions`)
- **AND** the panel SHALL surface pi's self-update-unavailable instruction for the pi row

### Requirement: Update controls are single-flight (no concurrent-operation error)

While any package operation is in flight, the Update-all control and per-row Update buttons SHALL be disabled so a second click cannot start a concurrent operation. In-flight state SHALL survive navigation away from and back to the panel (tracked outside component-local state). If the server reports busy, the client SHALL show an inline "an update is already running" hint rather than an error toast.

#### Scenario: Controls disabled during an in-flight update
- **WHEN** an update (any row or Update-all) is running
- **THEN** all Update controls SHALL render disabled until it completes
- **AND** a second activation SHALL NOT issue a request

#### Scenario: In-flight state survives navigation
- **WHEN** the user navigates away from Settings and back while an update runs
- **THEN** the controls SHALL still render disabled (in-flight state not lost)

#### Scenario: Server-busy is shown inline
- **WHEN** the server returns a busy/conflict response
- **THEN** the client SHALL show an inline "already running" hint, not a generic error

### Requirement: Rows render the correct affordance per install classification

Each core row SHALL render its affordance from the status classification (`updatable` + `manualAction`) BEFORE any click: updatable rows show an Update action; non-updatable rows show a non-clickable state with the `manualAction` instruction (e.g. "git pull", "brew upgrade", "reinstall the app"). The dashboard SHALL NOT require a failed update attempt to discover non-updatability.

#### Scenario: Non-updatable row shows instruction without a click
- **WHEN** the status reports the pi row `updatable: false` with a `manualAction`
- **THEN** the row SHALL render the instruction and a disabled control
- **AND** SHALL NOT present a clickable Update that would fail
