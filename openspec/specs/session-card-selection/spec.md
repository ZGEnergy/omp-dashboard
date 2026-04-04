## MODIFIED Requirements

### Requirement: Selected session card visual indicator
The currently selected session card SHALL have a clearly visible visual indicator distinguishing it from unselected cards. The indicator SHALL use a blue border, subtle blue background tint, and outer ring glow.

#### Scenario: Selected session card on desktop
- **WHEN** a session card is the currently selected session
- **THEN** the card SHALL render with `border-blue-500/60`, `bg-blue-500/5`, and `ring-1 ring-blue-500/30`

#### Scenario: Unselected session card
- **WHEN** a session card is not selected
- **THEN** the card SHALL render with the default border and background (no blue highlight)

#### Scenario: Selected session card on mobile
- **WHEN** a session card is the currently selected session on mobile
- **THEN** the card SHALL render with the same blue highlight as desktop

#### Scenario: Selected card remains visible while scrolling
- **WHEN** the user scrolls the session list
- **THEN** the selected card's highlight SHALL be immediately recognizable without careful inspection
