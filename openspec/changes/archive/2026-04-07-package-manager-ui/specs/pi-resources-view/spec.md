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

## ADDED Requirements

### Requirement: Merged scope sections
The Installed tab SHALL show two merged sections: Local (loose resources + local packages) and Global (loose resources + global packages) instead of separate Local/Global/Packages sections.

#### Scenario: View merged Local section
- **WHEN** user views the Installed tab for a workspace with local loose resources and local packages
- **THEN** both are displayed together under a single "Local" section

#### Scenario: View merged Global section
- **WHEN** user views the Installed tab
- **THEN** global loose resources and global packages are displayed together under a single "Global" section

### Requirement: Collapsible resource hierarchy
All sections, resource groups (Skills/Extensions/Prompts), and package items SHALL be collapsible with chevron toggles, defaulting to collapsed. Progressive indentation (16px per depth) SHALL visually distinguish hierarchy levels.

#### Scenario: Collapse a section
- **WHEN** user clicks the chevron toggle on a section header (e.g., "Local")
- **THEN** the section collapses, hiding all nested resource groups and package items

#### Scenario: Default collapsed state
- **WHEN** the Installed tab loads
- **THEN** all sections, resource groups, and package items are collapsed by default

#### Scenario: Visual indentation
- **WHEN** nested items are expanded
- **THEN** each depth level is indented by 16px to visually distinguish the hierarchy
