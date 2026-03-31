## MODIFIED Requirements

### Requirement: Localhost bypass
The auth module SHALL skip authentication entirely for requests originating from loopback addresses (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`). Additionally, if `auth.bypassUrls` is configured, the auth module SHALL skip authentication for HTTP requests whose URL starts with any entry in that list. Both bypass rules apply before any cookie/session validation.

#### Scenario: Localhost HTTP request without cookie
- **WHEN** an HTTP request arrives from `127.0.0.1` with no auth cookie
- **THEN** the request SHALL proceed without authentication

#### Scenario: Localhost WebSocket upgrade without cookie
- **WHEN** a WebSocket upgrade request arrives from `::1` with no auth cookie
- **THEN** the upgrade SHALL proceed without authentication

#### Scenario: External HTTP request without cookie
- **WHEN** an HTTP request arrives from a non-loopback IP with no auth cookie and the URL does not match any `bypassUrls` entry
- **THEN** the server SHALL redirect to `/auth/login` (for HTML requests) or return 401 (for API/JSON requests)

#### Scenario: External WebSocket upgrade without cookie
- **WHEN** a WebSocket upgrade request arrives from a non-loopback IP with no valid auth cookie
- **THEN** the server SHALL reject the upgrade with HTTP 401

#### Scenario: External HTTP request matching bypassUrls
- **WHEN** an HTTP request arrives from a non-loopback IP with no auth cookie and the URL starts with an entry in `auth.bypassUrls`
- **THEN** the request SHALL proceed without authentication
