## ADDED Requirements

### Requirement: Folder group header shows OpenSpec section
Each folder group in the session list SHALL render a `FolderOpenSpecSection` component in the folder header, below git info and above editor/spawn buttons, when OpenSpec data is available for that directory.

#### Scenario: Directory with initialized OpenSpec
- **WHEN** a folder group is rendered for cwd `/project/foo` and OpenSpec data for that cwd has `initialized: true`
- **THEN** a `FolderOpenSpecSection` SHALL be rendered in the folder header

#### Scenario: Directory without OpenSpec
- **WHEN** a folder group is rendered for cwd `/project/foo` and OpenSpec data has `initialized: false` or is not available
- **THEN** no OpenSpec section SHALL be rendered in the folder header

#### Scenario: Pinned directory with no sessions
- **WHEN** a pinned directory has OpenSpec data but no active sessions
- **THEN** the `FolderOpenSpecSection` SHALL still be rendered showing change list and folder-level actions

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

### Requirement: Change list displays all changes with status
The expanded folder OpenSpec section SHALL list all changes, sorted with in-progress first then completed.

#### Scenario: Changes sorted by status
- **WHEN** the folder has changes `["done-change" (complete), "wip-change" (in-progress)]`
- **THEN** `"wip-change"` SHALL appear before `"done-change"`

#### Scenario: Change card shows name, PDST button, session links, task count
- **WHEN** a change `"add-auth"` has artifacts `[proposal: done, design: ready]`, 2 attached sessions, and `3/8 tasks`
- **THEN** the change card SHALL show: `add-auth  [s1] [s2]  3/8 tasks  [PD]` where `[PD]` is a single button after the tasks counter

### Requirement: Change list displays linked sessions
The expanded folder OpenSpec change list SHALL show clickable session indicators per change, displaying sessions that have `attachedProposal` matching the change name.

#### Scenario: Change with attached sessions
- **WHEN** change `"add-auth"` is listed in folder `/project/foo` and sessions `["s1", "s2"]` have `attachedProposal = "add-auth"`
- **THEN** the change row SHALL show clickable session names/IDs next to the change name

#### Scenario: Clicking session link navigates to session
- **WHEN** the user clicks on session `"s1"` link in the change row for `"add-auth"`
- **THEN** the UI SHALL navigate/scroll to session `"s1"`

#### Scenario: Change with no attached sessions
- **WHEN** change `"fix-bug"` has no sessions with `attachedProposal = "fix-bug"`
- **THEN** the change row SHALL show no session indicators

#### Scenario: Artifact letter colors
- **WHEN** artifacts have statuses done/ready/blocked
- **THEN** letters SHALL be green/yellow/muted respectively (same as current `OpenSpecSection`)

### Requirement: Folder-level Refresh button
The folder OpenSpec section header SHALL include a refresh button that triggers an immediate re-poll of OpenSpec data for that directory.

#### Scenario: Refresh sends openspec_refresh with cwd
- **WHEN** the user clicks the refresh button on folder `/project/foo`
- **THEN** the browser SHALL send `{ type: "openspec_refresh", cwd: "/project/foo" }`

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

### Requirement: Archive button in folder OpenSpec section
The folder OpenSpec section header SHALL include an "Archive" button next to the existing "Specs" button, visible only when OpenSpec is initialized.

#### Scenario: Archive button rendered
- **WHEN** a folder OpenSpec section is rendered with `initialized: true` and an `onOpenArchive` callback is provided
- **THEN** an "Archive" button SHALL be displayed next to the "Specs" button

#### Scenario: Archive button opens archive browser
- **WHEN** the user clicks the "Archive" button on folder `/project/foo`
- **THEN** the `ArchiveBrowserView` SHALL open in the content area for that cwd

#### Scenario: Archive button not rendered without callback
- **WHEN** the `onOpenArchive` prop is not provided
- **THEN** the "Archive" button SHALL NOT be rendered
