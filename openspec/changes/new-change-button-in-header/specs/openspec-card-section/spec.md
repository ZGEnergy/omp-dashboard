## MODIFIED Requirements

### Requirement: New Change button placement
The "+ New Change" button SHALL be in the OpenSpec section header row, alongside "Bulk Archive" and the refresh button. It SHALL NOT appear at the bottom of the expanded changes list.

#### Scenario: Header row shows New Change button
- **WHEN** the OpenSpec section is rendered with a session that supports sending prompts
- **THEN** the header row SHALL contain a "+ New Change" button

#### Scenario: New Change button sends prompt
- **WHEN** the user clicks the "+ New Change" button
- **THEN** the system SHALL send the `/opsx:new` prompt to the session

#### Scenario: Button visible when section collapsed
- **WHEN** the OpenSpec section is collapsed
- **THEN** the "+ New Change" button SHALL still be visible in the header row
