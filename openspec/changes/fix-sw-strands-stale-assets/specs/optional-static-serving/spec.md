## ADDED Requirements

### Requirement: Service worker MUST NOT intercept requests
The service worker registered at `/sw.js` SHALL exist solely to satisfy
PWA install criteria. It MUST NOT register a `fetch` event listener
and MUST NOT synthesise responses for any request. All HTTP requests
from the browser SHALL reach the dashboard server natively, with no
service-worker interception layer between them.

#### Scenario: New install — SW is a no-op
- **WHEN** a user visits `http://localhost:8000/` for the first time
- **AND** the browser registers `/sw.js`
- **THEN** the service worker SHALL install successfully
- **AND** the service worker SHALL NOT have a `fetch` event listener
- **AND** every subsequent HTTP request SHALL go directly to the dashboard server (no `(from service worker)` parenthetical in DevTools Network panel)

#### Scenario: Stale SW from prior version on upgrade
- **WHEN** a user has a previously-installed service worker with an active `fetch` listener (i.e. the pre-fix variant)
- **AND** the user reloads the page after upgrading to the new dashboard build
- **THEN** the browser SHALL fetch the new `/sw.js`, detect the byte-content change, and trigger an install
- **AND** the new `sw.js` install handler SHALL call `self.skipWaiting()` so the new SW becomes active without requiring all tabs to close
- **AND** the new `sw.js` activate handler SHALL call `self.clients.claim()` to take over the open tab
- **AND** the new `sw.js` activate handler SHALL clear all `Cache Storage` entries via `caches.delete` for every key in `caches.keys()`
- **AND** after the next navigation the page SHALL load without `(from service worker)` 5xx responses

#### Scenario: PWA install prompt remains available
- **WHEN** the dashboard meets Chromium's PWA install criteria (HTTPS or localhost, valid manifest, registered SW)
- **AND** the user visits the site at least once
- **THEN** Chromium SHALL show the PWA install affordance per its standard heuristic
- **AND** the absence of a `fetch` event listener SHALL NOT disqualify the SW from PWA install criteria

#### Scenario: Server response is the only source of truth
- **WHEN** any HTTP request is issued from a tab controlled by `/sw.js`
- **THEN** the response status code, headers, and body SHALL be exactly what the dashboard server returned
- **AND** the service worker SHALL NOT substitute a synthesised response under any condition
