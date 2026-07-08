# collapsible-groups — delta

## MODIFIED Requirements

### Requirement: Collapsible folder groups
Each folder group header SHALL include a chevron toggle icon (▸ collapsed, ▾ expanded). Clicking the chevron or the group header SHALL toggle the collapsed/expanded state of that group's session cards.

When a group is collapsed, the header SHALL show only the folder's identity and status: the folder path/name, the session count, the `FolderNeedsYouPill` (when any child session needs attention), and a working/idle status rollup. The heavy header slots — git branch bar, folder action bar, sidebar-folder-section plugin slot, OpenSpec proposal-state section, and spawn buttons — SHALL NOT render while collapsed. All of these SHALL render again when the group is expanded.

The folder group SHALL remain draggable (for reorder) while collapsed: the drag handle SHALL NOT be part of the hidden slot block.

#### Scenario: Collapse a group
- **WHEN** a user clicks an expanded folder group header
- **THEN** the session cards within that group SHALL animate closed (smooth height transition) and the chevron SHALL change to ▸

#### Scenario: Expand a collapsed group
- **WHEN** a user clicks a collapsed folder group header
- **THEN** the session cards within that group SHALL animate open (smooth height transition) and the chevron SHALL change to ▾

#### Scenario: Default state
- **WHEN** a folder group is rendered for the first time with no persisted state
- **THEN** it SHALL be expanded by default

#### Scenario: Collapsed header hides heavy slots
- **WHEN** a folder group is collapsed
- **THEN** the git branch bar, folder action bar, plugin sections, OpenSpec proposal-state section, and spawn buttons SHALL NOT be present in the DOM
- **AND** the folder name and session count SHALL still be shown

#### Scenario: Expanding restores the slots
- **WHEN** a user expands a previously collapsed folder group
- **THEN** the spawn buttons and other header slots SHALL become present again

#### Scenario: Collapsed folder stays draggable
- **WHEN** a folder group is collapsed
- **THEN** its drag handle SHALL remain present so the folder can be reordered without expanding it first

## ADDED Requirements

### Requirement: Collapsed folder status rollup
While a folder group is collapsed, its header SHALL show a compact status rollup summarising the group's non-ended sessions by ambient state: a working count (streaming/resuming sessions) and an idle count (active/idle sessions). The `needs-you` (chat-routed `ask_user`) state SHALL NOT be counted in this rollup — it is surfaced separately by the clickable needs-you pill. The rollup SHALL render nothing when both counts are zero. Colors SHALL derive from the semantic `--status-working` and `--status-idle` tokens.

#### Scenario: Rollup shows working and idle counts
- **WHEN** a collapsed folder contains 1 streaming and 2 idle sessions
- **THEN** the header rollup SHALL show a working count of 1 and an idle count of 2

#### Scenario: Rollup excludes needs-you and ended
- **WHEN** a collapsed folder contains an `ask_user` (needs-you) session and an ended session
- **THEN** neither SHALL be counted in the working/idle rollup

#### Scenario: Rollup hidden when empty
- **WHEN** a collapsed folder has no working or idle sessions
- **THEN** the rollup SHALL render nothing
