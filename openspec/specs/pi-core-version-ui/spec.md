## ADDED Requirements

### Requirement: Settings panel version section
The Settings panel SHALL include a "Pi Ecosystem" section displaying all core pi packages with their version status.

#### Scenario: Package list rendered
- **WHEN** the user opens Settings
- **THEN** the Pi Ecosystem section SHALL display each core package with its display name, current version, latest version, and install source

#### Scenario: Update available shown
- **WHEN** a package has `updateAvailable: true`
- **THEN** the section SHALL show "current → latest" version text and an "Update" button for that package

#### Scenario: Package up to date
- **WHEN** a package has `updateAvailable: false`
- **THEN** the section SHALL show "✓ latest" next to the current version

#### Scenario: Update All button
- **WHEN** multiple packages have updates available
- **THEN** an "Update All (N)" button SHALL appear where N is the count of updatable packages

#### Scenario: Check Now button
- **WHEN** the user clicks "Check Now"
- **THEN** the section SHALL force-refresh version data from the server with `?refresh=true`
- **AND** show a loading state during the check

#### Scenario: Last checked timestamp
- **WHEN** version data is loaded
- **THEN** the section SHALL display "Last checked: X min ago" using the `lastChecked` field

#### Scenario: Update in progress
- **WHEN** a package update is running
- **THEN** the Update button SHALL show a spinner and be disabled
- **AND** progress messages SHALL be displayed

#### Scenario: Update error displayed
- **WHEN** a package update fails
- **THEN** the error message SHALL be displayed below the package entry

### Requirement: Header update badge
The app header SHALL display a badge when core pi package updates are available.

#### Scenario: Badge visible with count
- **WHEN** `updatesAvailable > 0` from the version status
- **THEN** a small badge SHALL appear in the header showing the update count (e.g., "⬆ 2")

#### Scenario: Badge hidden when current
- **WHEN** `updatesAvailable === 0`
- **THEN** the badge SHALL not be rendered

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
