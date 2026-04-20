## ADDED Requirements

### Requirement: Server notifies browsers after provider credential changes

The server SHALL broadcast a `models_refreshed` message to all connected browser clients whenever a provider credential is written or removed.

#### Scenario: OAuth provider authenticated
- **WHEN** a user completes OAuth authentication for a provider (e.g., Anthropic)
- **THEN** the server broadcasts `models_refreshed` to all connected browser WebSocket clients

#### Scenario: API key saved
- **WHEN** a user saves an API key for a provider
- **THEN** the server broadcasts `models_refreshed` to all connected browser WebSocket clients

#### Scenario: Credential removed
- **WHEN** a user removes a provider credential
- **THEN** the server broadcasts `models_refreshed` to all connected browser WebSocket clients

### Requirement: Client refreshes model lists on models_refreshed

The client SHALL clear its cached model lists and re-request models for the currently selected session when it receives a `models_refreshed` message.

#### Scenario: models_refreshed received with active session selected
- **WHEN** the browser receives a `models_refreshed` message
- **AND** a session is currently selected
- **THEN** the client clears all cached model lists from `modelsMap`
- **AND** immediately sends `request_models` for the selected session

#### Scenario: models_refreshed received with no session selected
- **WHEN** the browser receives a `models_refreshed` message
- **AND** no session is currently selected
- **THEN** the client clears all cached model lists from `modelsMap`

#### Scenario: Selecting a different session after models_refreshed
- **WHEN** the client has cleared `modelsMap` due to `models_refreshed`
- **AND** the user selects a session that has no cached models
- **THEN** the client sends `request_models` for that session

### Requirement: Bridge logs credential reload errors

The bridge SHALL log errors that occur during the `credentials_updated` handler instead of silently ignoring them.

#### Scenario: authStorage reload fails
- **WHEN** the bridge receives `credentials_updated`
- **AND** `authStorage.reload()` throws an error
- **THEN** the error is logged via `console.error` with a `[dashboard]` prefix

#### Scenario: getAvailable fails after reload
- **WHEN** the bridge receives `credentials_updated`
- **AND** `getAvailable()` throws an error
- **THEN** the error is logged via `console.error` with a `[dashboard]` prefix
