## MODIFIED Requirements

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

## ADDED Requirements

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
