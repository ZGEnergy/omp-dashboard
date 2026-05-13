## MODIFIED Requirements

### Requirement: Back navigation button
The session header SHALL display a back button. The back button on both desktop and mobile SHALL invoke `window.history.back()` when browser history has more than one entry, and SHALL fall back to `navigate("/")` on cold loads (history length === 1). No priority-chain dispatcher, no overlay-state cleanup, no URL-route auto-close logic.

#### Scenario: Back from sidebar-opened overlay returns to prior URL
- **GIVEN** the user is on `/settings` on desktop or mobile
- **WHEN** the user clicks a sidebar P/D/T/S artifact letter, which navigates to `/folder/:encodedCwd/openspec/:changeName/:artifactId`
- **AND** then clicks the back button
- **THEN** the URL SHALL return to `/settings`
- **AND** the SettingsPanel SHALL be rendered

#### Scenario: Back from session detail with empty history
- **GIVEN** the user is on `/session/abc` on desktop
- **AND** browser history has only one entry (cold load / hard refresh / deep link)
- **WHEN** the user clicks the back button
- **THEN** the URL SHALL change to `/`
- **AND** LandingPage SHALL be rendered

#### Scenario: Back unwinds chained overlay URLs naturally
- **GIVEN** the user navigated `/` → `/session/abc` → `/folder/:cwd/openspec/:c/proposal` → `/folder/:cwd/openspec/archive`
- **WHEN** the user clicks the back button repeatedly
- **THEN** each click SHALL pop one URL from history in reverse order

## REMOVED Requirements

### Requirement: Sidebar overlays auto-close URL-route views
**Reason**: This requirement was added by the now-superseded `fix-desktop-back-navigation` change. With URL-routed overlays, sidebar interactions push a new URL onto history; back returns to the prior URL naturally. The "auto-close" hack and its associated `navigate`/`settingsMatch`/`tunnelSetupMatch` plumbing are removed.

**Migration**: Code that relied on this behaviour now uses standard `navigate(buildXxxUrl(...))` calls; the previously-displayed view (Settings, Tunnel, Session) is preserved in browser history and recoverable via `window.history.back()`.

## ADDED Requirements

### Requirement: OpenSpec proposal preview route
The client SHALL define a route `/folder/:encodedCwd/openspec/:changeName/:artifactId` that renders the OpenSpec proposal preview for the specified change and artifact. `:encodedCwd` is base64url-encoded via `encodeFolderPath`. `:changeName` and `:artifactId` are `encodeURIComponent`-encoded.

#### Scenario: Direct navigation to preview URL
- **WHEN** user navigates to `/folder/:encodedCwd/openspec/my-change/proposal`
- **THEN** the OpenSpecPreview component SHALL be rendered with `cwd`, `changeName="my-change"`, and `initialArtifact="proposal"` derived from the URL

#### Scenario: Refresh on preview URL
- **WHEN** user refreshes the page at the preview URL with no in-memory state
- **THEN** the page SHALL show a loading state until WebSocket replay populates `openspecMap`
- **THEN** the preview SHALL render once data is available

#### Scenario: Invalid change name in URL
- **WHEN** user navigates to a preview URL with a `:changeName` that does not exist in the folder's openspec data
- **THEN** the page SHALL render a "Not found" inline component with a back button — NOT redirect to `/` automatically

### Requirement: OpenSpec archive browser route
The client SHALL define a route `/folder/:encodedCwd/openspec/archive` that renders the archive browser for the specified folder.

#### Scenario: Navigate to archive URL
- **WHEN** user navigates to `/folder/:encodedCwd/openspec/archive`
- **THEN** ArchiveBrowserView SHALL be rendered with the decoded `cwd`

### Requirement: OpenSpec specs browser route
The client SHALL define a route `/folder/:encodedCwd/openspec/specs` that renders the specs browser for the specified folder.

#### Scenario: Navigate to specs URL
- **WHEN** user navigates to `/folder/:encodedCwd/openspec/specs`
- **THEN** SpecsBrowserView SHALL be rendered with the decoded `cwd`

### Requirement: README preview route
The client SHALL define a route `/folder/:encodedCwd/readme` that renders the README preview for the specified folder.

#### Scenario: Navigate to README URL
- **WHEN** user navigates to `/folder/:encodedCwd/readme`
- **THEN** MarkdownPreviewView SHALL be rendered with the README content fetched via `/api/readme?cwd=...`

### Requirement: Pi resources index route
The client SHALL define a route `/folder/:encodedCwd/pi-resources` that renders the pi resources browser for the specified folder.

#### Scenario: Navigate to pi-resources URL
- **WHEN** user navigates to `/folder/:encodedCwd/pi-resources`
- **THEN** PiResourcesView SHALL be rendered with the decoded `cwd`

### Requirement: Pi resource file preview route
The client SHALL define a route `/pi-resource` that accepts query parameters `path` (URL-encoded absolute filesystem path) and `title` (URL-encoded display title) and renders the resource file preview.

#### Scenario: Navigate to pi-resource URL
- **WHEN** user navigates to `/pi-resource?path=...&title=...`
- **THEN** MarkdownPreviewView SHALL be rendered with content fetched via `/api/pi-resource-file?path=...`
- **AND** the page header SHALL display the decoded `title`

#### Scenario: Missing path parameter
- **WHEN** user navigates to `/pi-resource` without a `path` query parameter
- **THEN** the page SHALL redirect to `/`

### Requirement: Session file diff route
The client SHALL define a route `/session/:id/diff` that renders the file diff view for the specified session.

#### Scenario: Navigate to diff URL
- **WHEN** user navigates to `/session/abc/diff`
- **THEN** FileDiffView SHALL be rendered for session `abc`
- **AND** the diff data SHALL be fetched via `/api/session-diff?sessionId=abc`

### Requirement: Shell overlay URL reflects current state
For every full-content-area view owned by the shell (i.e. excluding plugin-contributed `content-view` claims), the current URL SHALL be the single source of truth for which view is rendered. Shell components SHALL NOT keep parallel `useState` flags that determine which overlay is active. State derivable from the URL (cwd, change name, artifact id, session id, query params) SHALL be read from `useRoute` params or `URLSearchParams`, not from in-memory copies.

#### Scenario: URL is sole source of truth for shell overlays
- **GIVEN** any shell overlay route in the proposal table is the current URL
- **WHEN** the page is hard-refreshed
- **THEN** the same overlay SHALL re-render once any required async data resolves
- **AND** no `useState` flag in `App.tsx` or `useContentViews` SHALL gate that rendering

#### Scenario: Plugin-owned overlays remain out of scope
- **GIVEN** a plugin contributes a `content-view` claim selected by predicate (e.g. `flows-plugin`'s `FlowAgentDetailClaim` / `FlowArchitectDetailClaim` / `FlowYamlPreviewClaim`)
- **WHEN** that overlay is active
- **THEN** the URL is NOT required to reflect it under this requirement
- **AND** a follow-up change covers URL participation for plugin claims

### Requirement: Sidebar interactions push onto browser history
Every sidebar action that opens a shell-owned content-area view (OpenSpec artifact letters, README links, pi-resource links, archive browser, specs browser, file-diff toggle) SHALL invoke `navigate(<route>)` with default push semantics. Replace semantics SHALL NOT be used unless explicitly required for an invalid-URL redirect.

#### Scenario: Sidebar action grows browser history
- **GIVEN** the user is on any URL with `window.history.length === N`
- **WHEN** the user clicks any sidebar action that opens a shell-owned content-area view
- **THEN** `window.history.length` SHALL be `N + 1` after the navigation
- **AND** clicking back SHALL restore the previous URL

### Requirement: Mobile depth derives from route matches
The mobile `getMobileDepth` SHALL derive depth from `useRoute` match flags, not from `useState` overlay flags. Specifically:
- Depth 0 (list) when only `/` matches
- Depth 1 (detail) when `/session/:id`, `/folder/:cwd/...`, `/terminal/:id`, `/settings`, or `/tunnel-setup` matches without an overlay sub-route
- Depth 2 (preview) when any of the new overlay routes match

#### Scenario: Depth 2 on overlay route
- **WHEN** the URL is `/folder/:encodedCwd/openspec/:changeName/:artifactId` on mobile
- **THEN** `getMobileDepth({ hasOverlayRoute: true, ... })` SHALL return `2`
