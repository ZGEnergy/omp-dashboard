## ADDED Requirements

### Requirement: Configurable auth bypass URL list
The dashboard SHALL support a `bypassUrls` field inside `auth` config containing an array of URL path prefixes that skip OAuth authentication for HTTP requests. When a request URL starts with any entry in the list, the `onRequest` hook SHALL allow the request through without requiring a valid session cookie. The field SHALL be optional; when absent or empty, behaviour SHALL be identical to the current implementation.

#### Scenario: Request matches a bypass prefix
- **WHEN** `auth.bypassUrls` contains `"/webhooks/"` and an unauthenticated request arrives at `/webhooks/github`
- **THEN** the server SHALL process the request without redirecting to `/auth/login` or returning 401

#### Scenario: Request does not match any bypass prefix
- **WHEN** `auth.bypassUrls` contains `"/webhooks/"` and an unauthenticated request arrives at `/api/sessions`
- **THEN** the server SHALL enforce authentication as normal (redirect or 401)

#### Scenario: bypassUrls is empty
- **WHEN** `auth.bypassUrls` is `[]` or omitted from config
- **THEN** auth bypass behaviour SHALL be identical to the current implementation (no additional paths bypassed)

#### Scenario: Multiple bypass prefixes
- **WHEN** `auth.bypassUrls` is `["/metrics", "/healthz"]` and unauthenticated requests arrive at `/metrics` and `/healthz/ready`
- **THEN** both requests SHALL be allowed through without authentication

#### Scenario: Bypass prefix is not a prefix of the request URL
- **WHEN** `auth.bypassUrls` contains `"/api/public"` and the request URL is `/api/publications`
- **THEN** authentication SHALL be enforced (prefix must be a leading substring match — `startsWith`)
