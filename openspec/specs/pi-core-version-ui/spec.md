# pi-core-version-ui Specification

## Purpose
UI affordances in Settings → Pi Ecosystem for displaying installed pi-ecosystem versions, surfacing available updates, and giving users access to release notes / changelog content for the canonical core packages.
## Requirements
### Requirement: Settings panel version section
The Pi Ecosystem settings panel SHALL render the three sub-groups (Core / Recommended Extensions / Other) with per-row version, update availability, and a per-row Update action. The per-row Update action SHALL delegate to the resolved pi's updater: the **pi row** runs `pi update --self`; each **extension row** runs `pi update --extension <source>`. A row whose package is not updatable by the dashboard SHALL render a non-clickable `manual`/`Locked` state with the package's `manualAction` instruction.

The section SHALL contain three sub-groups: **Core**, **Recommended Extensions**, and **Other Packages**. Each sub-group SHALL render its rows using the same row component, and each package SHALL appear in exactly one sub-group, classified in priority order Core → Recommended → Other.

The "Pi Ecosystem" header (with `Last checked` timestamp and `Check Now` button) SHALL apply to the unified section as a whole.

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

#### Scenario: Three sub-groups rendered
- **WHEN** the user opens the Packages tab in Settings
- **THEN** the panel SHALL display sub-groups labeled "Core", "Recommended Extensions", and "Other Packages" in that vertical order
- **AND** each sub-group SHALL list its packages using the same row component

#### Scenario: Core group whitelist content
- **WHEN** the Core sub-group renders
- **THEN** it SHALL contain ONLY packages returned by `GET /api/pi-core/status` (i.e., the strict whitelist)
- **AND** Core rows SHALL NOT have an Uninstall affordance

#### Scenario: Recommended group cross-reference
- **WHEN** an installed package row's `source` matches an entry in `RECOMMENDED_EXTENSIONS` (via the existing `matchesRecommendedSource` helper)
- **THEN** the row SHALL appear in the Recommended Extensions sub-group
- **AND** the row's display name SHALL be the `displayName` from the recommended manifest, not the raw source string

#### Scenario: Other group fallthrough
- **WHEN** an installed package row is not in the Core whitelist AND not matched to any `RECOMMENDED_EXTENSIONS` entry
- **THEN** the row SHALL appear in the Other Packages sub-group

#### Scenario: No duplicate rows across groups
- **WHEN** a package is eligible for multiple groups (e.g., a Core whitelist member also listed in `settings.json packages[]`)
- **THEN** the package SHALL appear only in the highest-priority eligible group (Core wins over Recommended wins over Other)

#### Scenario: Row identity and source caption
- **WHEN** any package row is rendered
- **THEN** it SHALL display: a display name (friendly), a source caption (the raw `source` string), a source-type badge (`npm` / `git` / `local` / `global`), and a current version pill
- **AND** when `latestVersion` is known and differs from `currentVersion`, the row SHALL show "current → latest" with an Update affordance

#### Scenario: Bundled badge
- **WHEN** a recommended-extension row has `isBundled: true`
- **THEN** an additional `[bundled]` badge SHALL appear next to the source-type badge

#### Scenario: Update available shown
- **WHEN** a package has `updateAvailable: true`
- **THEN** the row SHALL show "current → latest" version text and an "Update" button

#### Scenario: Package up to date
- **WHEN** a package has no update available
- **THEN** the row SHALL show an "up to date" indication and SHALL NOT render an Update action

#### Scenario: Update All button
- **WHEN** multiple packages in the Core sub-group have updates available
- **THEN** an "Update All (N)" button SHALL appear above the Core sub-group where N is the count of updatable Core packages

#### Scenario: Check Now button
- **WHEN** the user clicks "Check Now"
- **THEN** the section SHALL force-refresh both the Core data (`/api/pi-core/status?refresh=true`) and the installed-packages data (`/api/packages/check-updates`)
- **AND** show a loading state during the check

#### Scenario: Last checked timestamp
- **WHEN** version data is loaded
- **THEN** the section SHALL display "Last checked: X min ago" using the `lastChecked` field

#### Scenario: Update in progress
- **WHEN** a package update is running
- **THEN** the Update button SHALL show a spinner and be disabled
- **AND** progress messages SHALL be displayed inline on that row

#### Scenario: Update error displayed
- **WHEN** a package update fails
- **THEN** the error message SHALL be displayed below the package row

#### Scenario: Uninstall via row menu
- **WHEN** the user opens the kebab menu on a Recommended or Other row
- **THEN** an "Uninstall" action SHALL be available
- **AND** clicking it SHALL invoke the existing `/api/packages/remove` flow
- **AND** Core rows SHALL NOT show an Uninstall action

### Requirement: Header update badge
The Pi Ecosystem panel header SHALL display an update indicator (count badge plus status dot) **only when at least one update is available**, and SHALL hide the indicator when all packages are current. The indicator SHALL be the at-a-glance signal that updates exist without opening the panel.

#### Scenario: Indicator visible with count
- **WHEN** one or more packages have updates available
- **THEN** the header SHALL show the update count badge and a status dot

#### Scenario: Indicator hidden when current
- **WHEN** all packages are up to date
- **THEN** the header SHALL show neither the count badge nor the status dot

#### Scenario: Badge click navigates to settings
- **WHEN** the user clicks the update badge
- **THEN** the app SHALL navigate to the Settings panel

#### Scenario: Badge polls periodically
- **WHEN** the app is open
- **THEN** the badge SHALL fetch version status on mount and every 30 minutes thereafter

### Requirement: Version check hook
The client SHALL provide a `usePiCoreVersions` hook for fetching and polling core version status.

#### Scenario: Initial fetch on mount
- **WHEN** the hook mounts
- **THEN** it SHALL fetch `GET /api/pi-core/versions` and return the `PiCoreStatus` data

#### Scenario: Periodic polling
- **WHEN** the hook is mounted
- **THEN** it SHALL re-fetch every 30 minutes

#### Scenario: Manual refresh
- **WHEN** `refresh()` is called
- **THEN** the hook SHALL re-fetch with `?refresh=true`

#### Scenario: Refresh after update complete
- **WHEN** a `package_operation_complete` WebSocket message is received with a core package source
- **THEN** the hook SHALL re-fetch version data

### Requirement: Breaking-change icon on Core rows
The Core sub-group of `UnifiedPackagesSection` SHALL render a "what's new" icon next to the row's `[Update]` button whenever a non-empty changelog is available between the row's installed and latest versions, regardless of whether the changelog contains breaking changes.

The icon SHALL render in one of two visual states:

- **Breaking state** — `mdiAlertCircleOutline` from `@mdi/js`, amber color (`text-amber-400`), `aria-label` "Breaking changes since your version — click for details" — used when the changelog contains ≥1 `### Breaking Changes` section in range.
- **Info state** — `mdiInformationOutline` from `@mdi/js`, muted color (`text-[var(--text-muted)]`), `aria-label` "View what's new — click to see release notes" — used when the changelog has releases in range but no breaking changes.

The icon SHALL NOT render when the changelog endpoint returned `releases: []` (no release notes available for the range).

#### Scenario: Breaking icon when breaking changes exist
- **WHEN** a Core row's package has `updateAvailable: true`
- **AND** `GET /api/pi-core/changelog?pkg=<row.name>&from=<currentVersion>&to=<latestVersion>` returns `hasBreaking: true`
- **THEN** the row SHALL render the amber `mdiAlertCircleOutline` icon between the version arrow and the `[Update]` button

#### Scenario: Info icon when no breaking changes but releases exist
- **WHEN** the changelog response returns `hasBreaking: false`
- **AND** `releases.length > 0`
- **THEN** the row SHALL render the muted `mdiInformationOutline` icon between the version arrow and the `[Update]` button
- **AND** the row's existing `[Update]` button SHALL remain functional

#### Scenario: Icon hidden when no releases
- **WHEN** the changelog response returns `releases: []`
- **OR** the package has `updateAvailable: false`
- **THEN** the row SHALL NOT render any what's-new icon

#### Scenario: Icon hidden for non-pi packages
- **WHEN** the row's package name is not `@mariozechner/pi-coding-agent` (or its declared successor)
- **THEN** the row SHALL NOT render any what's-new icon, regardless of changelog response
- **AND** the changelog endpoint SHALL NOT be requested for that row

#### Scenario: Icon hidden during loading and error states
- **WHEN** the changelog request is in flight
- **OR** the changelog request failed
- **THEN** the row SHALL NOT render any what's-new icon
- **AND** the row's existing `[Update]` button SHALL remain functional

#### Scenario: Icon click opens WhatsNewDialog
- **WHEN** the user clicks any what's-new icon (breaking or info state)
- **THEN** the section SHALL open `WhatsNewDialog` populated with the changelog response that produced the icon
- **AND** the dialog's `[Update to <latest>]` CTA SHALL be wired to the same `onUpdate` handler as the row's `[Update]` button

#### Scenario: Tooltip text matches state
- **WHEN** the user hovers the icon (pointer devices) in breaking state
- **THEN** a tooltip SHALL display "<N> breaking change(s) since your version" where N is the count of breaking-change bullets across all releases in the response
- **WHEN** the user hovers the icon in info state
- **THEN** a tooltip SHALL display "View what's new"

### Requirement: On-demand changelog fetch
The Core sub-group SHALL fetch the changelog for `@mariozechner/pi-coding-agent` lazily — only when an update is available — and reuse the cached result for subsequent renders within the same session.

#### Scenario: Fetch triggered when update appears
- **WHEN** `usePiCoreVersions` reports the pi row transitioning from `updateAvailable: false` to `updateAvailable: true`
- **THEN** the section SHALL issue exactly one `GET /api/pi-core/changelog` request for that version range
- **AND** SHALL NOT issue duplicate requests for the same `(currentVersion, latestVersion)` pair within the same session

#### Scenario: No fetch when up to date
- **WHEN** the pi row reports `updateAvailable: false`
- **THEN** the section SHALL NOT issue any changelog request

#### Scenario: Re-fetch after pi update completes
- **WHEN** a `package_operation_complete` WebSocket message is received for `@mariozechner/pi-coding-agent`
- **AND** the post-update version comparison again yields `updateAvailable: true` (e.g., another release landed)
- **THEN** the section SHALL re-issue the changelog request for the new range

#### Scenario: Failure does not block row interaction
- **WHEN** the changelog request fails (network error, 4xx, 5xx)
- **THEN** the section SHALL NOT display the icon
- **AND** the row's `[Update]` button SHALL remain enabled and functional
- **AND** an error MAY be logged client-side but SHALL NOT be displayed inline on the row

### Requirement: Auto-check installed packages for updates
The dashboard SHALL automatically check installed packages for available updates without requiring the user to click `[Check Now]`. This mirrors pi's interactive-TUI behaviour, which runs `packageManager.checkForAvailableUpdates()` on every startup.

#### Scenario: Auto-check fires on mount
- **WHEN** `UnifiedPackagesSection` mounts AND the initial installed-packages list has loaded
- **THEN** the section SHALL issue `POST /api/packages/check-updates` exactly once, automatically, without user interaction
- **AND** populate the per-row `updateAvailable` indicator from the response

#### Scenario: Auto-check polls periodically
- **WHEN** `UnifiedPackagesSection` is mounted
- **THEN** the section SHALL re-issue `POST /api/packages/check-updates` every 30 minutes
- **AND** the polling cadence SHALL be cancelled on unmount

#### Scenario: Auto-check re-fires after package operation
- **WHEN** a `package_operation_complete` WS message is received with `success: true`
- **THEN** the section SHALL re-issue `POST /api/packages/check-updates`
- **AND** the updated `updateAvailable` set SHALL be reflected on every affected row immediately

#### Scenario: Manual Check Now still works
- **WHEN** the user clicks the `[Check Now]` button
- **THEN** the section SHALL issue `POST /api/packages/check-updates` immediately
- **AND** the auto-poll timer SHALL be reset to 30 minutes from the manual click

#### Scenario: Auto-check failure does not disrupt UI
- **WHEN** the auto-check request fails (network, 4xx, 5xx)
- **THEN** the section SHALL NOT display an inline error
- **AND** the next scheduled poll SHALL still fire
- **AND** existing rows SHALL continue to render whatever update state was last successfully fetched

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

