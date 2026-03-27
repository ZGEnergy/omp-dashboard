## MODIFIED Requirements

### Requirement: Group header display
Group headers SHALL display the full absolute directory path (with middle truncation for long paths) and git context information.

#### Scenario: Group with git branch and PR
- **WHEN** a group's sessions have git branch and PR information
- **THEN** the group header SHALL show the full directory path, branch name as a clickable link, and PR number as a clickable link

#### Scenario: Group with branch only
- **WHEN** a group's sessions have git branch but no PR
- **THEN** the group header SHALL show the full directory path and branch name (as link if URL available, otherwise plain text)

#### Scenario: Group without git info
- **WHEN** a group's sessions have no git information
- **THEN** the group header SHALL show only the full directory path

## ADDED Requirements

### Requirement: Pinned groups with zero sessions show group controls
Pinned directory groups SHALL show editor buttons and the "New" spawn button even when they have zero sessions. The editor detection query SHALL include pinned directory cwds in addition to session-derived cwds.

#### Scenario: Empty pinned group with available editor
- **WHEN** a directory is pinned and has zero sessions and an editor (e.g., Zed) is detected for that path
- **THEN** the group header SHALL display the editor button

#### Scenario: Empty pinned group spawn button
- **WHEN** a directory is pinned and has zero sessions
- **THEN** the group header SHALL display the "New" spawn button

#### Scenario: Empty pinned group with no editor
- **WHEN** a directory is pinned, has zero sessions, and no editor is detected
- **THEN** the group header SHALL display only the "New" spawn button without editor buttons
