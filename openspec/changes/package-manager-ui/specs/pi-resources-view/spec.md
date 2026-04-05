## MODIFIED Requirements

### Requirement: Resources view shows installed pi resources for a workspace
The PiResourcesView SHALL include a tab bar with "Installed" (existing view) and "Packages" (new) tabs. The "Packages" tab SHALL display the PackageBrowser in local scope, showing installed local packages and allowing search/install/remove/update for the workspace's `.pi/settings.json`.

#### Scenario: Switch to Packages tab
- **WHEN** user clicks the "Packages" tab in PiResourcesView
- **THEN** the PackageBrowser is shown in local scope for the current workspace cwd

#### Scenario: Install local package
- **WHEN** user clicks "Install" on a package in the Packages tab
- **THEN** the package is installed via `POST /api/packages/install` with `scope: "local"` and the workspace cwd

#### Scenario: Default tab is Installed
- **WHEN** user opens PiResourcesView
- **THEN** the "Installed" tab is selected by default showing the existing resources view
