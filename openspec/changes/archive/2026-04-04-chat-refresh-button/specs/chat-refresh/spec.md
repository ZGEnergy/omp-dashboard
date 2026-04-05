## ADDED Requirements

### Requirement: Refresh button in session header

A refresh icon button is displayed in the session header that re-fetches all events for the current session.

#### Scenario: Desktop refresh button visible
- **WHEN** a session is selected on desktop
- **THEN** a refresh icon button appears in the session header after the duration badge

#### Scenario: Click refresh clears and re-subscribes
- **WHEN** the user clicks the refresh button
- **THEN** the local session state is reset to initial state
- **AND** a subscribe message with `lastSeq: 0` is sent to the server
- **AND** the chat view repopulates with replayed events

#### Scenario: Loading indicator while refreshing
- **WHEN** the refresh button is clicked
- **THEN** the icon spins briefly to indicate loading

#### Scenario: Mobile refresh via action menu
- **WHEN** a session is selected on mobile
- **THEN** a "Refresh Chat" option appears in the MobileActionMenu
- **AND** clicking it triggers the same refresh behavior
