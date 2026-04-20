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
The settings panel SHALL render as a full-page view in the main content area when the route is `/settings`. It SHALL display a fixed header (back button, title, Restart and Save buttons), a tab bar, and a scrollable content area for the active tab. The header and tab bar SHALL remain visible at all times regardless of scroll position.

The panel SHALL provide 4 tabs:
- **General**: Server (`port`, `piPort`, `autoShutdown`, `shutdownIdleSeconds`), Sessions (`spawnStrategy`), Tunnel (`tunnel.enabled`), Developer (`devBuildOnReload`)
- **Providers**: Provider Authentication (ProviderAuthSection) and LLM Providers (custom OpenAI-compatible endpoints)
- **Security**: OAuth dashboard access (`auth.providers` per-provider config, `auth.allowedUsers`, `auth.bypassUrls`, `auth.bypassHosts`)
- **Advanced**: Memory Limits (`memoryLimits.maxEventsPerSession`, `memoryLimits.maxStringFieldSize`, `memoryLimits.maxWsBufferBytes`)

#### Scenario: Settings panel layout with tabs
- **WHEN** the user navigates to `/settings`
- **THEN** the panel SHALL display a fixed header with back button, "Settings" title, Restart button, and Save button
- **AND** below the header, a tab bar with 4 tabs: General, Providers, Security, Advanced
- **AND** below the tab bar, the active tab's content in a scrollable area
- **AND** the General tab SHALL be selected by default

#### Scenario: Fixed header stays visible on scroll
- **WHEN** the active tab's content is long enough to scroll
- **THEN** the header and tab bar SHALL remain fixed at the top
- **AND** only the tab content area SHALL scroll

#### Scenario: Tab switching
- **WHEN** the user clicks a different tab
- **THEN** the content area SHALL display that tab's settings sections
- **AND** the clicked tab SHALL show an active indicator (accent underline)
- **AND** the previously active tab SHALL lose its active indicator

#### Scenario: General tab content
- **WHEN** the General tab is active
- **THEN** the content SHALL display Server, Sessions, Tunnel, and Developer sections with their respective fields

#### Scenario: Providers tab content
- **WHEN** the Providers tab is active
- **THEN** the content SHALL display the Provider Authentication section (ProviderAuthSection component) and the LLM Providers section (custom endpoint cards with add/remove)

#### Scenario: Security tab content
- **WHEN** the Security tab is active
- **THEN** the content SHALL display OAuth provider configuration (GitHub, Google, Keycloak, OIDC), Allowed Users textarea, Bypass URLs textarea, and Trusted Hosts textarea

#### Scenario: Advanced tab content
- **WHEN** the Advanced tab is active
- **THEN** the content SHALL display Memory Limits fields (max events per session, max string truncation, max WebSocket buffer)

#### Scenario: Save applies across all tabs
- **WHEN** the user modifies fields on multiple tabs and clicks Save
- **THEN** the panel SHALL send all changed fields (from any tab) in a single save operation

#### Scenario: Settings panel back navigation
- **WHEN** the user clicks the back button in the header
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

### Requirement: Settings panel displays configurable dashboard options
The settings panel SHALL include a "Packages" section for managing globally installed pi packages. This section SHALL display the list of installed global packages with uninstall and update buttons, and a "Browse Packages" button that opens the PackageBrowser in global scope.

#### Scenario: View global packages in settings
- **WHEN** user opens the Settings panel
- **THEN** a "Packages" section shows all globally installed pi packages

#### Scenario: Browse packages from settings
- **WHEN** user clicks "Browse Packages" in the settings Packages section
- **THEN** the PackageBrowser opens in global scope for searching and installing packages

#### Scenario: Uninstall from settings
- **WHEN** user clicks "Uninstall" on an installed global package
- **THEN** the package is removed via `POST /api/packages/remove` with `scope: "global"`

#### Scenario: Update from settings
- **WHEN** user clicks "Update" on an installed global package
- **THEN** the package is updated via `POST /api/packages/update` with the package source and `scope: "global"`

### Requirement: Provider save refreshes available models
When LLM providers are saved via the Settings panel, the server SHALL broadcast a `credentials_updated` message to all connected pi sessions. This MUST cause the model registry to refresh and push updated `models_list` messages back to the dashboard client. The Default Model selector SHALL display the updated model list without requiring a server restart.

#### Scenario: Saving new provider populates model selector
- **WHEN** the user adds a new LLM provider and clicks Save
- **THEN** the server broadcasts `credentials_updated` to all sessions
- **AND** each session's bridge refreshes its model registry
- **AND** the Default Model selector in Settings shows models from the new provider

#### Scenario: Removing a provider updates model selector
- **WHEN** the user removes an LLM provider and clicks Save
- **THEN** models from the removed provider no longer appear in the Default Model selector

#### Scenario: Models available immediately after save
- **WHEN** the user saves provider changes and opens the Default Model selector
- **THEN** models from all configured providers are listed
- **AND** no server restart is required
