## ADDED Requirements

### Requirement: Session card action row with divider
Each session card SHALL display a thin horizontal divider (`border-t border-gray-700/30`) below the info rows (status, model, activity, git). Below the divider, an action row SHALL contain: editor buttons (if available), source badge, and hide/unhide button.

#### Scenario: Card with editor buttons and source badge
- **WHEN** a session card is rendered with detected editors
- **THEN** the card SHALL show info rows, a thin divider, then an action row with editor buttons on the left, source badge in the middle, and hide button on the right

#### Scenario: Card without editor buttons
- **WHEN** a session card is rendered without detected editors
- **THEN** the action row SHALL show only the source badge and hide/unhide button

### Requirement: Selected card accent
The currently selected session card SHALL display a subtle left border accent (`border-l-2 border-blue-500/40`) in addition to the existing background highlight. All session cards SHALL have an explicit `bg-[var(--bg-tertiary)]` background to create visual layering within the folder container.

#### Scenario: Card selected
- **WHEN** a session card is the currently selected session
- **THEN** the card SHALL have `bg-[var(--bg-tertiary)]` background AND a `border-l-2 border-blue-500/40` left accent

#### Scenario: Card not selected
- **WHEN** a session card is not selected
- **THEN** the card SHALL have `bg-[var(--bg-tertiary)]` background with no left accent border

#### Scenario: Card layering within folder
- **WHEN** a session card is rendered inside a folder group container
- **THEN** the card background (`--bg-tertiary`) SHALL be visually distinct from the folder container background (`--bg-secondary`)

### Requirement: Source badge in action row
The source badge (tui, tmux, dashboard, zed) SHALL be displayed in the action row below the divider, rather than inline with the session name on the first line.

#### Scenario: Source badge position
- **WHEN** a session card is rendered
- **THEN** the source badge SHALL appear in the action row below the thin divider, not on the first line next to the session name
