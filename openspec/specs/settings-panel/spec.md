## ADDED Requirements

### Requirement: Settings button in sidebar header
The sidebar header SHALL include a gear icon button positioned at the end of the header row (after the collapse button). Clicking the button SHALL navigate to `/settings`.

#### Scenario: Settings button visible
- **WHEN** the sidebar is rendered
- **THEN** a gear icon button SHALL be visible in the header row after the collapse button

#### Scenario: Settings button click
- **WHEN** the user clicks the gear icon button
- **THEN** the app SHALL navigate to `/settings` and the main content area SHALL show the settings panel

### Requirement: Settings panel view
The settings panel SHALL render as a full-page view in the main content area (replacing the session/chat view) when the route is `/settings`. It SHALL display form fields for all editable `DashboardConfig` fields, grouped by category.

#### Scenario: Settings panel layout
- **WHEN** the user navigates to `/settings`
- **THEN** the panel SHALL display the following groups:
  - **Server**: `port`, `piPort`, `autoShutdown`, `shutdownIdleSeconds`
  - **Sessions**: `spawnStrategy`
  - **Tunnel**: `tunnel.enabled`
  - **Authentication**: `auth.providers` (per-provider clientId/clientSecret/issuerUrl), `auth.allowedUsers` (usernames, emails, domain wildcards), `auth.bypassUrls` (URL path prefixes that skip authentication)
  - **Developer**: `devBuildOnReload`

#### Scenario: bypassUrls field display
- **WHEN** the Settings panel is open and auth is configured
- **THEN** the Authentication group SHALL show a textarea labelled "Bypass URLs" containing one URL prefix per line (e.g. `/webhooks/`)

#### Scenario: bypassUrls field save
- **WHEN** the user edits the Bypass URLs textarea and clicks Save
- **THEN** the client SHALL POST `{ auth: { bypassUrls: <array of trimmed non-empty lines> } }` to `/api/config` and the server SHALL merge it into the running config

#### Scenario: Settings panel back navigation
- **WHEN** the user clicks a back button or the π logo in the sidebar
- **THEN** the app SHALL navigate away from `/settings` to the previous view

### Requirement: Config read endpoint
The server SHALL expose `GET /api/config` returning the current dashboard configuration. The endpoint SHALL be localhost-only (use `localhostGuard`). Auth secrets and provider client secrets SHALL be redacted in the response (replaced with `"***"`).

#### Scenario: Read config
- **WHEN** a localhost `GET /api/config` request is received
- **THEN** the server SHALL return `{ success: true, data: <config> }` with secrets redacted

#### Scenario: Read config from external IP
- **WHEN** a non-localhost `GET /api/config` request is received
- **THEN** the server SHALL return 403

#### Scenario: Secret redaction
- **WHEN** config contains `auth.secret` or `auth.providers.github.clientSecret`
- **THEN** the response SHALL replace those values with `"***"`

### Requirement: Config write endpoint
The server SHALL expose `PUT /api/config` accepting a partial config object. The endpoint SHALL be localhost-only. It SHALL merge the provided fields with the existing config, write to `~/.pi/dashboard/config.json`, and apply runtime changes.

#### Scenario: Update single field
- **WHEN** `PUT /api/config` receives `{ "autoShutdown": false }`
- **THEN** the server SHALL merge with existing config, write to disk, apply the change at runtime, and return `{ success: true }`

#### Scenario: Update auth providers
- **WHEN** `PUT /api/config` receives `{ "auth": { "providers": { "github": { "clientId": "new", "clientSecret": "new" } } } }`
- **THEN** the server SHALL update auth config, rebuild provider registry, and return `{ success: true }`

#### Scenario: Preserve redacted secrets
- **WHEN** `PUT /api/config` receives `{ "auth": { "providers": { "github": { "clientId": "new", "clientSecret": "***" } } } }`
- **THEN** the server SHALL keep the existing `clientSecret` value (not overwrite with `"***"`)

#### Scenario: Fields requiring restart
- **WHEN** `PUT /api/config` changes `port` or `piPort`
- **THEN** the server SHALL save to disk, return `{ success: true, restartRequired: true }`, and NOT apply the port change at runtime

#### Scenario: External IP write attempt
- **WHEN** a non-localhost `PUT /api/config` request is received
- **THEN** the server SHALL return 403

### Requirement: Runtime config apply
After writing config to disk, the server SHALL apply changes that can take effect without restart.

#### Scenario: autoShutdown changed
- **WHEN** `autoShutdown` or `shutdownIdleSeconds` is changed
- **THEN** the server SHALL update the idle timer parameters immediately

#### Scenario: spawnStrategy changed
- **WHEN** `spawnStrategy` is changed
- **THEN** the new strategy SHALL be used for the next spawned session

#### Scenario: auth config changed
- **WHEN** `auth` section is changed
- **THEN** the server SHALL rebuild the OAuth provider registry and update the JWT secret for subsequent requests

#### Scenario: port changed
- **WHEN** `port` or `piPort` is changed
- **THEN** the server SHALL NOT attempt to rebind — the change takes effect on next server start

### Requirement: Settings form behavior
The settings panel SHALL load current config on mount via `GET /api/config`. Form fields SHALL be pre-populated with current values. A save button SHALL send changed fields via `PUT /api/config`. Success/error feedback SHALL be shown via a toast or inline message.

#### Scenario: Load settings on mount
- **WHEN** the settings panel mounts
- **THEN** it SHALL call `GET /api/config` and populate all form fields with current values

#### Scenario: Save changed settings
- **WHEN** the user modifies a field and clicks save
- **THEN** the panel SHALL send only the changed fields via `PUT /api/config`

#### Scenario: Restart required feedback
- **WHEN** the save response includes `restartRequired: true`
- **THEN** the panel SHALL display a message: "Some changes require a server restart to take effect"

#### Scenario: Save error
- **WHEN** the `PUT /api/config` request fails
- **THEN** the panel SHALL display an error message
