## ADDED Requirements

### Requirement: Provider authentication section in Settings
The Settings panel SHALL include a "Provider Authentication" section displaying all OAuth providers and a separate area for API key providers. Each OAuth provider SHALL show its name, authentication status, and a login or logout button. Each API key provider SHALL show its name and a text input for the key.

#### Scenario: Render unauthenticated OAuth provider
- **WHEN** the Settings panel loads and `anthropic` has `authenticated: false` in the status response
- **THEN** the UI SHALL show "Anthropic (Claude Pro/Max)" with a "Sign In" button

#### Scenario: Render authenticated OAuth provider
- **WHEN** `anthropic` has `authenticated: true` with an `expires` timestamp
- **THEN** the UI SHALL show "Anthropic (Claude Pro/Max)" with a green status indicator, the expiry as a relative time (e.g., "expires in 6 days"), and a "Sign Out" button

#### Scenario: Render API key provider with saved key
- **WHEN** `openai` has `authenticated: true` in the status response
- **THEN** the UI SHALL show "OpenAI" with a masked key display (e.g., "sk-...xxxx") and a remove button

### Requirement: OAuth popup login flow
When a user clicks "Sign In" for an auth-code provider, the UI SHALL call `POST /api/provider-auth/authorize`, open the returned `authUrl` in a popup window, and listen for the authorization code via `postMessage`, `BroadcastChannel`, and `localStorage` events. Upon receiving the code, it SHALL call `POST /api/provider-auth/exchange` and update the status display on success.

#### Scenario: Successful popup login
- **WHEN** the user clicks "Sign In" for Anthropic, completes consent in the popup, and the code is relayed back
- **THEN** the UI SHALL exchange the code, show a success indicator, and update the provider status to authenticated

#### Scenario: Popup blocked fallback
- **WHEN** the browser blocks the popup
- **THEN** the UI SHALL display the authorization URL as a copyable link and optionally a text input for the user to paste the callback URL manually

#### Scenario: Exchange error
- **WHEN** the token exchange returns an error
- **THEN** the UI SHALL display the error message and a "Try Again" button

### Requirement: Device code login flow
When a user clicks "Sign In" for GitHub Copilot, the UI SHALL call `POST /api/provider-auth/device-code`, display the verification URL and user code in a modal, and poll `GET /api/provider-auth/device-status/:flowId` until authorization completes or the code expires. The UI SHALL NOT automatically open the verification URL — see "Device code flow requires explicit user action to open browser".

#### Scenario: Successful device code login
- **WHEN** the user enters the code on GitHub and authorizes
- **THEN** the polling SHALL detect success, close the modal, and update the provider status to authenticated

#### Scenario: Device code expires
- **WHEN** the device code expires without authorization
- **THEN** the modal SHALL show "Code expired" with a "Try Again" button

#### Scenario: GitHub Enterprise domain prompt
- **WHEN** the user clicks "Sign In" for GitHub Copilot
- **THEN** the UI SHALL first prompt for a GitHub Enterprise domain (with a placeholder "blank for github.com") before starting the device code flow

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

### Requirement: API key entry
The UI SHALL provide text inputs for API key providers. When the user enters a key and confirms, the UI SHALL call `PUT /api/provider-auth/api-key` with the provider name and key. The input SHALL mask the key value after saving.

#### Scenario: Save new API key
- **WHEN** the user enters "sk-..." for OpenAI and clicks save
- **THEN** the UI SHALL call the API, show a success indicator, and mask the key display

#### Scenario: Remove API key
- **WHEN** the user clicks the remove button for an authenticated API key provider
- **THEN** the UI SHALL call `DELETE /api/provider-auth/openai` and update the status to unauthenticated

### Requirement: Logout for OAuth providers
When the user clicks "Sign Out" for an authenticated OAuth provider, the UI SHALL call `DELETE /api/provider-auth/:provider` and update the display to unauthenticated.

#### Scenario: Sign out from Anthropic
- **WHEN** the user clicks "Sign Out" for Anthropic
- **THEN** the UI SHALL remove the credential via API and show the "Sign In" button again

### Requirement: Status refresh on load and after changes
The UI SHALL fetch provider status from `GET /api/provider-auth/status` when the Settings panel mounts and after any login, logout, or API key change. The status SHALL reflect the current state of `auth.json`.

#### Scenario: Status refresh after login
- **WHEN** the user completes an OAuth login
- **THEN** the UI SHALL re-fetch `/api/provider-auth/status` and update all provider statuses
