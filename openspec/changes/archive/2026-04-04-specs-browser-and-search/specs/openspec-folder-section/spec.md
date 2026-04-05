## MODIFIED Requirements

### Requirement: Collapsible change list in folder section
The folder OpenSpec section SHALL be collapsed by default, showing a header line with chevron, label, change count, and action buttons. The header SHALL include a Refresh button on the left and a Specs button on the right. Clicking the header toggles expansion to show the full change list.

#### Scenario: Collapsed by default
- **WHEN** the folder OpenSpec section is first rendered
- **THEN** it SHALL show only the header line: `▶ OpenSpec (N changes)` with a Refresh button and a Specs button

#### Scenario: Expand on click
- **WHEN** the user clicks the folder OpenSpec header
- **THEN** the section SHALL expand to show all changes with PDST button and task counts, chevron changes to `▼`

#### Scenario: Collapse on click
- **WHEN** the user clicks the expanded folder OpenSpec header
- **THEN** the section SHALL collapse back to the header line only

## REMOVED Requirements

### Requirement: Folder-level Bulk Archive button with confirmation
**Reason**: Bulk Archive is moved to session-level actions where it is contextually more relevant. See `openspec-attach-combo` spec for the new location.
**Migration**: Use the Bulk Archive button on any session card in the folder group instead.

## ADDED Requirements

### Requirement: Folder-level Specs button opens specs browser
The folder OpenSpec section header SHALL include a "Specs" button on the right side of the header row. Clicking it SHALL open the specs browser view in the content area for that folder's cwd.

#### Scenario: Specs button visible in header
- **WHEN** the folder OpenSpec section is rendered
- **THEN** a "Specs" button SHALL appear on the right side of the header row

#### Scenario: Specs button opens specs browser
- **WHEN** the user clicks the "Specs" button on folder `/project/foo`
- **THEN** the content area SHALL switch to the `SpecsBrowserView` showing all specs from `openspec/specs/` in cwd `/project/foo`

#### Scenario: Specs button click does not toggle collapse
- **WHEN** the user clicks the "Specs" button
- **THEN** the click SHALL NOT toggle the collapsible change list (event propagation is stopped)
