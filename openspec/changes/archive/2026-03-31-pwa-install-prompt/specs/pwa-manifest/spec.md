## MODIFIED Requirements

### Requirement: PWA meta tags
The `index.html` SHALL include `<meta name="theme-color">` matching the manifest theme color, `<meta name="apple-mobile-web-app-capable" content="yes">` for iOS support, and `<link rel="apple-touch-icon" href="/icon-192.png">` for the iOS home screen icon.

#### Scenario: Meta tags present
- **WHEN** `index.html` is loaded
- **THEN** it SHALL contain theme-color and apple-mobile-web-app-capable meta tags

#### Scenario: Apple touch icon present
- **WHEN** `index.html` is loaded
- **THEN** it SHALL contain a `<link rel="apple-touch-icon" href="/icon-192.png">` tag
