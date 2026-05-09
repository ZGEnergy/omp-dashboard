## MODIFIED Requirements

### Requirement: Session card action row with divider
Each desktop session card SHALL display a thin horizontal divider (`border-t border-gray-700/30`) below the **subcard stack** (OPENSPEC / WORKSPACE / PROCESS / MEMORY / FLOWS, see `session-card-subcards`). Below the divider, an action row SHALL contain: editor buttons (if available), source badge, and hide/unhide button.

The grouped controls (OpenSpec attach combo, jj/git workspace pills, process list, memory plugin contributions, flow launcher) SHALL NOT appear in this action row — they live inside their respective subcards above the divider. The action row SHALL contain only the per-card chrome: editor buttons, source badge, hide/unhide.

#### Scenario: Card with editor buttons and source badge
- **WHEN** a session card is rendered with detected editors
- **THEN** the card SHALL show the header zone, the populated subcard stack, a thin divider, then an action row with editor buttons on the left, source badge in the middle, and hide button on the right

#### Scenario: Card without editor buttons
- **WHEN** a session card is rendered without detected editors
- **THEN** the action row SHALL show only the source badge and hide/unhide button

#### Scenario: Action row contains no grouped section controls
- **WHEN** a session card is rendered
- **THEN** the action row SHALL NOT contain `SessionOpenSpecActions`, `GitInfo`, `ProcessList`, or `SessionFlowActions` — those SHALL render inside their subcards above the divider
