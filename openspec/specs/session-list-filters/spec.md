# session-list-filters Specification

## Purpose
TBD - created by archiving change polish-header-logo-and-card-stripes. Update Purpose after archive.
## Requirements
### Requirement: Pin-folder button has explicit text label
The pin-folder button in the sidebar filter row of `SessionList.tsx` (next to the Active-only / Show hidden filter buttons) SHALL display both a pin icon AND a short text label `"Add folder"`. The button SHALL retain its `data-testid="pin-dir-dialog-btn"` test hook and SHALL provide a `title` attribute of `"Pin a folder to the sidebar"` for tooltip clarity. The previous icon-only `📌+` rendering SHALL be removed.

#### Scenario: Pin-folder button shows text label
- **WHEN** the sidebar header row renders with a non-null `onPinDirectory` callback
- **THEN** the pin button contains the text `"Add folder"` visible to the user
- **AND** the pin button contains a pin icon (mdiPin)
- **AND** the pin button does NOT render an additional `mdiPlus` icon

#### Scenario: Pin-folder button has descriptive tooltip
- **WHEN** the user hovers the pin-folder button
- **THEN** the `title` tooltip reads `"Pin a folder to the sidebar"`

#### Scenario: Pin-folder button still opens the pin dialog
- **WHEN** the user clicks the `"Add folder"` button
- **THEN** the pin-directory dialog opens (existing behaviour preserved)

