## ADDED Requirements

### Requirement: Pin toggle on directory group headers
Each directory group header SHALL display a pin/unpin control.

#### Scenario: Unpinned directory group header
- **WHEN** a directory group is not pinned
- **THEN** the group header SHALL display a pin button (📌 outline or similar icon) that pins the directory when clicked

#### Scenario: Pinned directory group header
- **WHEN** a directory group is pinned
- **THEN** the group header SHALL display an unpin button (filled 📌 or similar) that unpins the directory when clicked

### Requirement: Pinned directory groups always visible
Pinned directory groups SHALL always appear in the sidebar, even when they have zero sessions.

#### Scenario: Pinned directory with no sessions
- **WHEN** a directory is pinned but has no connected sessions
- **THEN** the group header SHALL still render, showing the directory name and "(0)" session count

#### Scenario: Pinned directory with no sessions shows spawn button
- **WHEN** a pinned directory has zero sessions
- **THEN** the group header SHALL display a "+ New" button to spawn a session in that directory

#### Scenario: Active-only filter does not hide pinned groups
- **WHEN** "Active only" filter is enabled and a pinned directory has only ended sessions
- **THEN** the pinned group header SHALL still be visible (sessions within may be filtered, but the group remains)

### Requirement: Drag-to-reorder pinned directories
Users SHALL be able to reorder pinned directory groups by dragging.

#### Scenario: Drag pinned directory to new position
- **WHEN** a user drags a pinned directory group from position 1 to position 3
- **THEN** the pinned directories list SHALL update to reflect the new order and persist the change

#### Scenario: Drag only within pinned section
- **WHEN** a user attempts to drag a pinned directory
- **THEN** the drag SHALL only allow reordering within the pinned section (cannot drag to unpinned section)

#### Scenario: Unpinned directories are not draggable
- **WHEN** a user attempts to drag an unpinned directory group
- **THEN** the drag SHALL not initiate (unpinned groups are auto-sorted by recency)

### Requirement: Manual pin dialog
Users SHALL be able to pin a directory path that is not currently visible in the sidebar.

#### Scenario: Open pin dialog
- **WHEN** a user clicks the "Pin directory" action (e.g., a button in the sidebar header area)
- **THEN** a dialog SHALL appear with a text input for entering a directory path

#### Scenario: Pin directory from dialog
- **WHEN** a user enters a path and confirms in the pin dialog
- **THEN** the directory SHALL be pinned and appear in the pinned section

### Requirement: Visual distinction between pinned and unpinned groups
The sidebar SHALL visually distinguish pinned directory groups from unpinned ones.

#### Scenario: Pinned group appearance
- **WHEN** a directory group is pinned
- **THEN** the group header SHALL display a 📌 icon (or equivalent) to indicate pinned status

#### Scenario: Section separator
- **WHEN** both pinned and unpinned directory groups exist
- **THEN** a visual separator (subtle line or spacing) SHALL appear between the pinned and unpinned sections
