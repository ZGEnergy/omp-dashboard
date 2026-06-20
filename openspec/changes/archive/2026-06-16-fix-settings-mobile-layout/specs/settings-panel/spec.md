## MODIFIED Requirements

### Requirement: Settings panel view
The settings panel SHALL render as a full-page view in the main content area when the route matches `/settings/:page?`. It SHALL display a fixed header (back button, title, Restart and Save buttons), a navigation listing pages grouped by concern, and a content area for the active page. The header SHALL remain visible at all times regardless of scroll position. A single `SettingsPanel` instance SHALL remain mounted across page changes so unsaved edits on any page persist until Save.

The navigation + content layout SHALL be responsive. The wrapper element containing the nav and the content area SHALL stack vertically on narrow (mobile) viewports and arrange side-by-side on wide (desktop, `md` breakpoint and up) viewports. On mobile the navigation SHALL render as a full-width horizontal, horizontally-scrollable tab strip positioned above the content, and the content area SHALL fill the remaining space below it with a non-zero width. On desktop the navigation SHALL render as a fixed-width vertical rail to the left of the content. At no viewport width SHALL the content area collapse to zero width or be positioned outside the visible viewport.

The panel SHALL provide these pages (nav groups in brackets):
- **General** [Dashboard]: Interface language, display preferences
- **Server** [Dashboard]: `port`, `piPort`, `autoShutdown`, `shutdownIdleSeconds`, `tunnel.enabled`, memory limits (`memoryLimits.*`)
- **Sessions** [Dashboard]: `spawnStrategy`, `defaultModel`, reattach/ordering, `askUserPromptTimeoutSeconds`, `spawnRegisterTimeoutMs`, `gitWorktreeEnabled`, `dashboardName`
- **Remote Servers** [Network]: known servers, network discovery
- **Security** [Network]: `auth.providers`, `auth.allowedUsers`, `auth.bypassUrls`, `auth.bypassHosts` (Trusted Networks)
- **Providers** [Extensions]: Provider Authentication, LLM Providers, API Proxy
- **Packages** [Extensions]: installed pi packages
- **Plugins** [Extensions]: plugin activation + inline settings
- **OpenSpec** [Extensions]: `openspec.enabled` polling tuning, OpenSpec Workflow Profile
- **Developer** [Advanced]: Diagnostics, Tools, Spawn Failures, `devBuildOnReload`, editor, chat-display debug events, capture-pi-output

The General page SHALL be the default when no page is specified. Each settings section SHALL render on exactly one page (no duplicate renders across pages).

#### Scenario: Page layout with nav rail
- **WHEN** the user navigates to `/settings/general`
- **THEN** the panel SHALL display a fixed header (back, "Settings" title, Restart, Save)
- **AND** a left nav rail listing the pages grouped under Dashboard / Network / Extensions / Advanced
- **AND** the active page's content beside the rail
- **AND** the General page SHALL be selected when no `:page` is given

#### Scenario: Page switching
- **WHEN** the user clicks a different page in the nav rail
- **THEN** the content area SHALL display that page's sections
- **AND** the clicked nav item SHALL show an active indicator
- **AND** the URL SHALL update to `/settings/<page>`

#### Scenario: Fixed header stays visible on scroll
- **WHEN** the active page's content is long enough to scroll
- **THEN** the header and nav rail SHALL remain visible
- **AND** only the page content area SHALL scroll

#### Scenario: Save applies across all pages
- **WHEN** the user modifies fields on multiple pages and clicks Save
- **THEN** the panel SHALL send all changed fields (from any page) in a single save operation
- **AND** navigating between pages before Save SHALL NOT discard unsaved edits

#### Scenario: Settings panel back navigation
- **WHEN** the user clicks the back button in the header
- **THEN** the app SHALL navigate away from settings to the previous view

#### Scenario: Mobile layout keeps content visible
- **WHEN** the user opens `/settings/general` at a viewport width below the `md` breakpoint (e.g. 390 px)
- **THEN** the nav + content wrapper SHALL be laid out vertically (nav above content)
- **AND** the navigation SHALL render as a full-width horizontal, horizontally-scrollable tab strip
- **AND** the content area SHALL have a non-zero width and be fully within the visible viewport (form fields visible without horizontal scrolling)

#### Scenario: Desktop layout unchanged
- **WHEN** the user opens `/settings/general` at a viewport width at or above the `md` breakpoint
- **THEN** the navigation SHALL render as a fixed-width vertical rail to the left of the content
- **AND** the content area SHALL occupy the remaining horizontal space to the right of the rail
