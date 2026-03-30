## MODIFIED Requirements

### Requirement: Auto-scroll to pending card
- **WHEN** a pending card appears AND the user is within 50px of the bottom (not scroll-locked)
- **THEN** the chat view SHALL auto-scroll to show it

#### Scenario: Auto-scroll to pending card when following
- **WHEN** a pending card appears AND the user is at or near the bottom
- **THEN** the chat view SHALL auto-scroll to show the pending card

#### Scenario: No auto-scroll to pending card when scroll-locked
- **WHEN** a pending card appears AND the user has scrolled up (more than 50px from bottom)
- **THEN** the chat view SHALL NOT auto-scroll
