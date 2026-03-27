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
The folder OpenSpec section SHALL be collapsed by default, showing a header line with chevron, label, change count, and action buttons. Clicking the header toggles expansion to show the full change list.

#### Scenario: Collapsed by default
- **WHEN** the folder OpenSpec section is first rendered
- **THEN** it SHALL show only the header line: `▶ OpenSpec (N changes)` with Refresh and Bulk Archive buttons

#### Scenario: Expand on click
- **WHEN** the user clicks the folder OpenSpec header
- **THEN** the section SHALL expand to show all changes with artifact letters and task counts, chevron changes to `▼`

#### Scenario: Collapse on click
- **WHEN** the user clicks the expanded folder OpenSpec header
- **THEN** the section SHALL collapse back to the header line only

### Requirement: Change list displays all changes with status
The expanded folder OpenSpec section SHALL list all changes, sorted with in-progress first then completed.

#### Scenario: Changes sorted by status
- **WHEN** the folder has changes `["done-change" (complete), "wip-change" (in-progress)]`
- **THEN** `"wip-change"` SHALL appear before `"done-change"`

#### Scenario: Change card shows name, artifact letters, task count
- **WHEN** a change `"add-auth"` has artifacts `[proposal: done, design: ready]` and `3/8 tasks`
- **THEN** the change card SHALL show: `add-auth  P D  3/8 tasks`

#### Scenario: Artifact letter colors
- **WHEN** artifacts have statuses done/ready/blocked
- **THEN** letters SHALL be green/yellow/muted respectively (same as current `OpenSpecSection`)

### Requirement: Folder-level Refresh button
The folder OpenSpec section header SHALL include a refresh button that triggers an immediate re-poll of OpenSpec data for that directory.

#### Scenario: Refresh sends openspec_refresh with cwd
- **WHEN** the user clicks the refresh button on folder `/project/foo`
- **THEN** the browser SHALL send `{ type: "openspec_refresh", cwd: "/project/foo" }`

### Requirement: Folder-level Bulk Archive button with confirmation
The folder OpenSpec section header SHALL include a Bulk Archive button. Clicking it SHALL show a confirmation dialog. On confirm, it SHALL send an `openspec_bulk_archive` message to the server with the directory's cwd.

#### Scenario: Bulk Archive confirmation
- **WHEN** the user clicks "Bulk Archive" on folder `/project/foo`
- **THEN** a confirmation dialog SHALL appear with message "Bulk archive all completed changes?"

#### Scenario: Bulk Archive confirmed
- **WHEN** the user confirms the Bulk Archive dialog
- **THEN** the browser SHALL send `{ type: "openspec_bulk_archive", cwd: "/project/foo" }`

#### Scenario: Bulk Archive cancelled
- **WHEN** the user cancels the Bulk Archive dialog
- **THEN** no action SHALL be taken
