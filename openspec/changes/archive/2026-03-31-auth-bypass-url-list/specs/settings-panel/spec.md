## MODIFIED Requirements

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
