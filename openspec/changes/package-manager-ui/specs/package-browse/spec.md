## ADDED Requirements

### Requirement: PackageBrowser component displays searchable package grid
The client SHALL provide a reusable `PackageBrowser` component that displays npm pi-packages in a searchable, filterable grid. It SHALL accept a `scope` prop ("global" or "local") and an optional `cwd` prop. The component SHALL be used in both Settings (global) and PiResourcesView (local).

#### Scenario: Initial load
- **WHEN** the PackageBrowser mounts
- **THEN** it fetches packages from `/api/packages/search` and displays them as cards

#### Scenario: Search by text
- **WHEN** user types in the search input
- **THEN** the package list filters to matching results after a debounce delay

#### Scenario: Filter by type
- **WHEN** user clicks a type pill (extension/skill/theme/prompt)
- **THEN** only packages matching that type are shown

### Requirement: Package cards show metadata and actions
Each package card SHALL display the package name, description, type badges, and weekly download count. Cards for already-installed packages SHALL show an "Installed" badge. Cards for not-installed packages SHALL show an "Install" button.

#### Scenario: Package not installed
- **WHEN** a package is not in the installed list
- **THEN** the card shows an "Install" button

#### Scenario: Package already installed
- **WHEN** a package is in the installed list
- **THEN** the card shows an "Installed" badge and an "Uninstall" button

### Requirement: README preview for packages
The PackageBrowser SHALL allow viewing a package's README. Clicking a package card or a "View" button SHALL fetch the README from `/api/packages/readme` and display it in a preview panel.

#### Scenario: View README
- **WHEN** user clicks on a package card
- **THEN** the README is fetched and displayed in a side panel or overlay

### Requirement: Install progress feedback
When a package install/remove/update is initiated, the UI SHALL show real-time progress received via WebSocket `package_progress` messages. The progress indicator SHALL display the current operation step (e.g., "Cloning...", "Installing dependencies...").

#### Scenario: Install with progress
- **WHEN** user clicks "Install" on a package card
- **THEN** a progress indicator appears showing streamed progress events until completion

#### Scenario: Install completes
- **WHEN** a `package_progress` event with `type: "complete"` arrives
- **THEN** the progress indicator disappears, the card updates to show "Installed" badge, and the installed packages list refreshes
