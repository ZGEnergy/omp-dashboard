## ADDED Requirements

### Requirement: Mobile kebab menu unattached Explore
When no proposal is attached and the session is alive, the mobile kebab menu (MobileActionMenu) SHALL show an "Explore" menu row that opens the ExploreDialog with no change name.

#### Scenario: Explore visible when unattached and alive
- **WHEN** a session has no attached proposal and status is not "ended"
- **THEN** the kebab menu SHALL show an OpenSpec section with an "Explore" row

#### Scenario: Explore hidden when ended
- **WHEN** a session has no attached proposal and status is "ended"
- **THEN** the kebab menu SHALL NOT show the unattached OpenSpec section

#### Scenario: Explore hidden when attached
- **WHEN** a session has an attached proposal
- **THEN** the unattached OpenSpec section SHALL NOT appear (the attached section renders instead)

#### Scenario: Explore sends prompt via dialog
- **WHEN** user taps "Explore" in the unattached section
- **THEN** the menu closes and the ExploreDialog opens with empty changeName
- **AND** on send, a `send_prompt` is sent with text `/skill:openspec-explore\n<user text>`

### Requirement: Mobile kebab menu unattached New Change
When no proposal is attached and the session is alive, the mobile kebab menu SHALL show a "+ New Change" menu row that opens the NewChangeDialog.

#### Scenario: New Change visible when unattached and alive
- **WHEN** a session has no attached proposal and status is not "ended"
- **THEN** the kebab menu SHALL show a "+ New Change" row in the OpenSpec section

#### Scenario: New Change sends prompt via dialog
- **WHEN** user taps "+ New Change" in the unattached section
- **THEN** the menu closes and the NewChangeDialog opens
- **AND** on send, a `send_prompt` is sent with the formatted `/opsx:new` command
