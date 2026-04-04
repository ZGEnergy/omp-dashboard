## MODIFIED Requirements

### Requirement: Pin toggle on directory group headers
Each directory group header SHALL display a single pin icon on the right side. When pinned, the icon SHALL be yellow `mdiPin` (click to unpin). When unpinned, the icon SHALL be muted `mdiPin` (click to pin). The left side of the header SHALL display a folder icon: `mdiFolderOpen` when the group is expanded, `mdiFolder` when collapsed.

#### Scenario: Pinned directory group header
- **WHEN** a directory group is pinned and expanded
- **THEN** the left icon SHALL be `mdiFolderOpen` and the right icon SHALL be a yellow `mdiPin` button
- **AND** clicking the right pin icon SHALL unpin the directory

#### Scenario: Pinned directory group header collapsed
- **WHEN** a directory group is pinned and collapsed
- **THEN** the left icon SHALL be `mdiFolder` and the right icon SHALL be a yellow `mdiPin` button

#### Scenario: Unpinned directory group header
- **WHEN** a directory group is not pinned
- **THEN** the left icon SHALL be `mdiFolderOpen` (or `mdiFolder` when collapsed) and the right icon SHALL be a muted `mdiPin` button
- **AND** clicking the right pin icon SHALL pin the directory

#### Scenario: No duplicate pin indicator on left
- **WHEN** a directory group is pinned
- **THEN** the left side SHALL NOT display a pin icon — only the folder icon
