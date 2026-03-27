## MODIFIED Requirements

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
