## ADDED Requirements

### Requirement: Web app manifest
The client SHALL include a `manifest.json` linked from `index.html` with `name` set to "PI Dashboard", `short_name` set to "PI Dash", `display` set to `standalone`, `start_url` set to `/`, `theme_color` and `background_color` set to appropriate brand colors, and at least one icon entry.

#### Scenario: Manifest is served
- **WHEN** a browser requests `/manifest.json`
- **THEN** the server SHALL return a valid web app manifest JSON file

#### Scenario: Manifest link in HTML
- **WHEN** the client `index.html` is loaded
- **THEN** it SHALL contain a `<link rel="manifest" href="/manifest.json">` tag

### Requirement: Service worker registration
The client SHALL register a service worker (`sw.js`) on page load. The service worker SHALL include a fetch event handler to satisfy PWA installability requirements.

#### Scenario: Service worker registers successfully
- **WHEN** the page loads in a browser that supports service workers
- **THEN** `navigator.serviceWorker.register("/sw.js")` SHALL be called

#### Scenario: Service worker fetch handler
- **WHEN** the service worker intercepts a fetch event
- **THEN** it SHALL pass through to the network (no caching)

#### Scenario: Browser without service worker support
- **WHEN** the page loads in a browser without service worker support
- **THEN** registration SHALL be skipped without errors

### Requirement: PWA meta tags
The `index.html` SHALL include `<meta name="theme-color">` matching the manifest theme color, `<meta name="apple-mobile-web-app-capable" content="yes">` for iOS support, and `<link rel="apple-touch-icon" href="/icon-192.png">` for the iOS home screen icon.

#### Scenario: Meta tags present
- **WHEN** `index.html` is loaded
- **THEN** it SHALL contain theme-color and apple-mobile-web-app-capable meta tags

#### Scenario: Apple touch icon present
- **WHEN** `index.html` is loaded
- **THEN** it SHALL contain a `<link rel="apple-touch-icon" href="/icon-192.png">` tag
