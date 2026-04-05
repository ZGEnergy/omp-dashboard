## ADDED Requirements

### Requirement: PackageBrowser component displays searchable package grid
The client SHALL provide a reusable `PackageBrowser` component that displays npm pi-packages in a searchable, filterable grid. It SHALL accept a `scope` prop ("global" or "local") and an optional `cwd` prop. The component SHALL render inline within the Settings panel or the Resources "Packages" tab. It SHALL include a text input for manually entering npm or git URLs for installation.

#### Scenario: Initial load
- **WHEN** the PackageBrowser mounts
- **THEN** it fetches packages from `/api/packages/search` and displays them as cards

#### Scenario: Search by text
- **WHEN** user types in the search input
- **THEN** the package list filters to matching results after a debounce delay

#### Scenario: Filter by type
- **WHEN** user clicks a type pill (extension/skill/theme/prompt)
- **THEN** only packages matching that type are shown

#### Scenario: Install from URL
- **WHEN** user pastes a source URL (e.g., `npm:@foo/bar` or `git:github.com/user/repo`) into the URL input and clicks Install
- **THEN** a confirmation dialog is shown and, upon confirm, the package is installed via `POST /api/packages/install`

### Requirement: Package cards show metadata and actions
Each package card SHALL display the package name, description, type badges, and weekly download count. Cards for already-installed packages SHALL show an "Installed" badge. Cards for not-installed packages SHALL show an "Install" button.

#### Scenario: Package not installed
- **WHEN** a package is not in the installed list
- **THEN** the card shows an "Install" button

#### Scenario: Package already installed
- **WHEN** a package is in the installed list
- **THEN** the card shows an "Installed" badge and an "Uninstall" button

### Requirement: README preview for packages
The PackageBrowser SHALL allow viewing a package's README in a dialog overlay. Clicking a package card SHALL fetch the README from `/api/packages/readme` and display it in a dialog with Install/Uninstall action and a close button.

#### Scenario: View README
- **WHEN** user clicks on a package card
- **THEN** the README is fetched and displayed in a dialog overlay with package name, version, and an action button

### Requirement: Install progress feedback
When a package install/remove/update is initiated, the UI SHALL show real-time progress received via WebSocket `package_progress` messages. The progress indicator SHALL display the current operation step (e.g., "Cloning...", "Installing dependencies...").

### Requirement: Install requires confirmation
When a user initiates an install, the UI SHALL show a confirmation dialog displaying the package name, source, and target scope before proceeding.

#### Scenario: Confirm install
- **WHEN** user clicks "Install" on a package card
- **THEN** a confirmation dialog shows the package name, source, and scope (global/local)
- **WHEN** user confirms
- **THEN** the install proceeds and a progress indicator appears showing streamed progress events

#### Scenario: Cancel install
- **WHEN** user clicks "Install" and then cancels the confirmation
- **THEN** no install occurs

### Requirement: Install progress feedback
When a package install/remove/update is in progress, the UI SHALL show real-time progress received via WebSocket `package_progress` messages.

#### Scenario: Install with progress
- **WHEN** a confirmed install begins
- **THEN** a progress indicator appears showing streamed progress events until completion

#### Scenario: Install completes
- **WHEN** a `package_progress` event with `type: "complete"` arrives
- **THEN** the progress indicator disappears, the card updates to show "Installed" badge, and the installed packages list refreshes

### Requirement: Check for updates on demand
The installed packages list SHALL include a "Check for Updates" button. Clicking it SHALL call the server to check for available updates and mark packages that have updates available. No proactive polling or update badges.

#### Scenario: Check for updates
- **WHEN** user clicks "Check for Updates"
- **THEN** the server checks each installed package for available updates and returns which packages have updates

#### Scenario: Update available
- **WHEN** a package has an update available after checking
- **THEN** the package card shows an "Update Available" indicator and an "Update" button
