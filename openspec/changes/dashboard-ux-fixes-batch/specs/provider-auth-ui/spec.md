## MODIFIED Requirements

### Requirement: Device code flow requires explicit user action to open browser
When the device code flow is initiated, the system SHALL NOT automatically open the verification URL in a new browser tab. Instead, the system SHALL display the verification URL as a clickable link and a dedicated "Open Registration Page" button. The user MUST manually click the button to open the URL.

#### Scenario: Device code flow shows button instead of auto-opening
- **WHEN** the user initiates a device code login (e.g., GitHub Copilot)
- **THEN** the device code modal displays the user code and verification URL
- **AND** a "Open Registration Page" button is shown
- **AND** no browser tab is opened automatically

#### Scenario: User clicks button to open registration
- **WHEN** the user clicks the "Open Registration Page" button in the device code modal
- **THEN** the verification URL opens in a new browser tab
