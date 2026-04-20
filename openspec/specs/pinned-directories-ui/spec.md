## ADDED Requirements

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
Users SHALL be able to pin a directory path that is not currently visible in the sidebar. The dialog SHALL render via DialogPortal at document.body with z-[60].

#### Scenario: Open pin dialog
- **WHEN** a user clicks the "Pin directory" action (e.g., a button in the sidebar header area)
- **THEN** a dialog SHALL appear with a PathPicker component for selecting a directory
- **AND** the dialog is rendered at document.body via DialogPortal

#### Scenario: Pin directory from dialog
- **WHEN** a user selects a path and confirms in the pin dialog
- **THEN** the directory SHALL be pinned and appear in the pinned section

### Requirement: Pin directory dialog ownership
The `PinDirectoryDialog` SHALL be mounted at the application root (`App.tsx`) and SHALL be opened by any component via an app-provided `onOpenPinDialog` callback. The sidebar "Add folder" button SHALL no longer own the dialog's mount state; it SHALL call `onOpenPinDialog` instead.

#### Scenario: Sidebar button triggers the shared dialog
- **GIVEN** the dashboard is mounted
- **WHEN** the user clicks the sidebar "Add folder" button
- **THEN** `SessionList` SHALL invoke `onOpenPinDialog` from its props
- **AND** the application root SHALL render `<PinDirectoryDialog>` via `DialogPortal`
- **AND** confirming a directory SHALL dispatch `{ type: "pin_directory", path }` over the WebSocket, identical to the previous behaviour

#### Scenario: LandingPage triggers the same shared dialog
- **GIVEN** the LandingPage is rendered in its empty state
- **WHEN** the user activates the Step ② "Add folder" CTA
- **THEN** `LandingPage` SHALL invoke the same `onOpenPinDialog` callback
- **AND** the `PinDirectoryDialog` SHALL appear without rendering a second instance anywhere in the tree

#### Scenario: Dialog state resets between opens
- **GIVEN** the user has opened and closed `PinDirectoryDialog` at least once
- **WHEN** the user opens it again from either entry point
- **THEN** the dialog SHALL appear with a fresh input state

### Requirement: Pin directory dialog uses PathPicker
Pin directory dialog (`PinDirectoryDialog.tsx`) SHALL use the `PathPicker` component for directory selection. The dialog SHALL serve as a thin wrapper providing the title and calling `onPin` with the selected path. All path navigation (typing, filtering, browsing) SHALL be handled by PathPicker internally.

### Requirement: Visual distinction between pinned and unpinned groups
The sidebar SHALL visually distinguish pinned directory groups from unpinned ones.

#### Scenario: Pinned group appearance
- **WHEN** a directory group is pinned
- **THEN** the group header SHALL display a 📌 icon (or equivalent) to indicate pinned status

#### Scenario: Section separator
- **WHEN** both pinned and unpinned directory groups exist
- **THEN** a visual separator (subtle line or spacing) SHALL appear between the pinned and unpinned sections
