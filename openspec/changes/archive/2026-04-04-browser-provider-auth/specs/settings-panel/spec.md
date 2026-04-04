## MODIFIED Requirements

### Requirement: Settings panel view
The settings panel SHALL render as a full-page view in the main content area (replacing the session/chat view) when the route is `/settings`. It SHALL display form fields for all editable `DashboardConfig` fields, grouped by category.

#### Scenario: Settings panel layout
- **WHEN** the user navigates to `/settings`
- **THEN** the panel SHALL display the following groups:
  - **Provider Authentication**: OAuth provider login buttons and API key inputs (from `provider-auth-ui` capability)
  - **Server**: `port`, `piPort`, `autoShutdown`, `shutdownIdleSeconds`
  - **Sessions**: `spawnStrategy`
  - **Tunnel**: `tunnel.enabled`
  - **Authentication**: `auth.providers` (per-provider clientId/clientSecret/issuerUrl), `auth.allowedUsers` (usernames, emails, domain wildcards), `auth.bypassUrls` (URL path prefixes that skip authentication), `auth.bypassHosts` (trusted source IPs/hosts that skip authentication — supports exact IP, wildcards, CIDR)
  - **Developer**: `devBuildOnReload`
