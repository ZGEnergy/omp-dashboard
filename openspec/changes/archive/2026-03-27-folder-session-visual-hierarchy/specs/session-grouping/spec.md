## ADDED Requirements

### Requirement: Folder group visual container
Each folder group SHALL be rendered as a visually distinct container with `bg-[var(--bg-secondary)]` background, `rounded-lg` corners, and internal padding. The container SHALL wrap both the folder header and all session cards within the group.

#### Scenario: Folder group with multiple sessions
- **WHEN** a folder group contains two or more sessions
- **THEN** the group SHALL render as a single container with `bg-[var(--bg-secondary)]` background, `rounded-lg` corners, containing the header and all session cards

#### Scenario: Folder group with single session
- **WHEN** a folder group contains one session
- **THEN** the group SHALL render as a container with the same styling as multi-session groups

#### Scenario: Empty pinned folder group
- **WHEN** a pinned folder group has zero sessions
- **THEN** the group SHALL still render as a container with `bg-[var(--bg-secondary)]` background and `rounded-lg` corners

### Requirement: Inter-group spacing
Folder group containers SHALL be separated by vertical spacing so they read as distinct blocks within the sidebar.

#### Scenario: Multiple folder groups visible
- **WHEN** the sidebar displays two or more folder groups
- **THEN** there SHALL be visible vertical gap between each group container

### Requirement: No border-b on folder header
The folder header within a group container SHALL NOT use a `border-b` bottom border, since the container background and spacing handle visual separation.

#### Scenario: Folder header rendering
- **WHEN** a folder header is rendered inside a group container
- **THEN** the header SHALL NOT have a bottom border separating it from session cards below
