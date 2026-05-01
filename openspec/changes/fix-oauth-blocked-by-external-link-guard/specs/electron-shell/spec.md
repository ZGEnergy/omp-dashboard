## MODIFIED Requirements

### Requirement: External links open in the OS default browser
The Electron main process SHALL ensure that no anchor click, `window.open` call, middle-click, or `target="_blank"` opens a child BrowserWindow. Every external http(s) URL initiated **from the dashboard** SHALL be handed off to `shell.openExternal` so the user's OS default browser handles it. Navigation that originates from a non-dashboard page (e.g. an OAuth provider's login flow currently displayed in the BrowserWindow) SHALL proceed without interception so multi-step authentication can complete. This requirement, combined with the `markdown-rendering` capability's external-anchor `target="_blank"` invariant, guarantees the dashboard window can never be "trapped" on an external page initiated from a chat-content link click while preserving every legitimate OAuth/OIDC flow.

#### Scenario: window.open routed to OS browser
- **WHEN** the renderer (or any page currently loaded in the BrowserWindow) calls `window.open("https://example.com", "_blank")`
- **THEN** `webContents.setWindowOpenHandler` SHALL return `{ action: "deny" }`
- **AND** the requested URL SHALL be passed to `shell.openExternal(url)` regardless of which page issued the call (this is correct for both chat-content links and OAuth device-code verification URIs)

#### Scenario: target=_blank anchor routed to OS browser
- **WHEN** the user clicks a markdown-rendered anchor with `target="_blank"`
- **THEN** the same window-open handler SHALL deny the child window and route the URL to `shell.openExternal`

#### Scenario: Top-level navigation pinned to dashboard origin (when on the dashboard)
- **WHEN** `webContents` emits `will-navigate` AND `webContents.getURL()` returns a URL whose origin equals the captured `new URL(serverUrl).origin`
- **AND** the navigation target's origin differs from the dashboard origin
- **THEN** the main process SHALL call `event.preventDefault()`
- **AND** SHALL pass the target URL to `shell.openExternal(url)`

#### Scenario: Mid-flight OAuth / OIDC navigation is not intercepted
- **WHEN** `webContents` emits `will-navigate` AND `webContents.getURL()` returns a URL whose origin is **not** the dashboard origin (e.g. the user is mid-login on `accounts.google.com`, `github.com`, `login.microsoftonline.com`, or any OAuth provider that the dashboard's `/auth/start/:provider` redirected them to)
- **THEN** the guard SHALL allow the navigation to proceed unchanged — it SHALL NOT call `event.preventDefault()` and SHALL NOT call `shell.openExternal`
- **AND** this includes provider-internal navigation (provider → provider), provider → dashboard callback redirects (`provider → http://<dashboard>/auth/callback/...`), and provider → third-party identity-broker navigations
- **AND** the eventual redirect back to the dashboard origin SHALL land in the BrowserWindow normally; no special handling is required because the resulting `will-navigate` (if it fires) is itself same-origin under the dashboard branch

#### Scenario: Same-origin SPA navigation unaffected
- **WHEN** the React app performs a `pushState` or hash route change within the dashboard origin
- **THEN** `will-navigate` SHALL NOT fire and the navigation SHALL succeed (this is Electron's documented behavior for `will-navigate`; the guard does not need to special-case it)

#### Scenario: Decision helper exists and is unit-tested
- **WHEN** a developer needs to decide whether a `will-navigate` event should be allowed, intercepted, or cancelled
- **THEN** they SHALL use the pure helper `decideWillNavigate(serverOrigin, currentUrl, targetUrl) → "allow" | "open-external" | "cancel"` exported from `packages/electron/src/lib/link-handling.ts`
- **AND** that helper SHALL be covered by unit tests for: same-origin navigation on the dashboard (allow), external target on the dashboard (open-external), provider-internal navigation while not on the dashboard (allow), provider → dashboard callback (allow), provider → third-party identity broker (allow), unparseable current URL (fall back to leaving-dashboard rules), unparseable server origin (fail closed → cancel)

#### Scenario: Decision helper fail-closes on unparseable server origin
- **WHEN** `decideWillNavigate` is called with a `serverOrigin` argument that cannot be parsed as a URL
- **THEN** the helper SHALL return `"cancel"` (the caller MUST `event.preventDefault()` without opening anything externally)
- **AND** this protects against a configuration error in `serverUrl` from accidentally allowing arbitrary external navigation
