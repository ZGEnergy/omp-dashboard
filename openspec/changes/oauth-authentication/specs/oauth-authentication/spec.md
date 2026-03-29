## ADDED Requirements

### Requirement: OAuth provider registry
The auth module SHALL maintain a registry of OAuth2 provider configurations. Each provider entry SHALL include: `clientId`, `clientSecret`, `authorizeUrl`, `tokenUrl`, `userInfoUrl`, and `scopes`. Built-in providers (GitHub, Google, Keycloak) SHALL have well-known URLs pre-configured; only `clientId` and `clientSecret` are required from the user. Keycloak and generic OIDC providers SHALL additionally require an `issuerUrl`.

#### Scenario: GitHub provider configured
- **WHEN** config contains `auth.providers.github` with `clientId` and `clientSecret`
- **THEN** the module SHALL register GitHub with authorize URL `https://github.com/login/oauth/authorize`, token URL `https://github.com/login/oauth/access_token`, user info URL `https://api.github.com/user`, and scope `user:email`

#### Scenario: Google provider configured
- **WHEN** config contains `auth.providers.google` with `clientId` and `clientSecret`
- **THEN** the module SHALL fetch OIDC discovery from `https://accounts.google.com/.well-known/openid-configuration` to resolve authorize, token, and userinfo endpoints, using scope `openid email profile`

#### Scenario: Keycloak provider configured
- **WHEN** config contains `auth.providers.keycloak` with `clientId`, `clientSecret`, and `issuerUrl`
- **THEN** the module SHALL fetch OIDC discovery from `{issuerUrl}/.well-known/openid-configuration` to resolve endpoints, using scope `openid email profile`

#### Scenario: Generic OIDC provider configured
- **WHEN** config contains `auth.providers.oidc` with `clientId`, `clientSecret`, `issuerUrl`, and optional `name`
- **THEN** the module SHALL fetch OIDC discovery from `{issuerUrl}/.well-known/openid-configuration` and use `name` as the display label (defaulting to "OIDC" if omitted)

#### Scenario: No providers configured
- **WHEN** config contains `auth` but `auth.providers` is empty or missing
- **THEN** the module SHALL treat auth as disabled (same as no `auth` key)

### Requirement: Localhost bypass
The auth module SHALL skip authentication entirely for requests originating from loopback addresses (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`). This applies to both HTTP requests and WebSocket upgrade requests.

#### Scenario: Localhost HTTP request without cookie
- **WHEN** an HTTP request arrives from `127.0.0.1` with no auth cookie
- **THEN** the request SHALL proceed without authentication

#### Scenario: Localhost WebSocket upgrade without cookie
- **WHEN** a WebSocket upgrade request arrives from `::1` with no auth cookie
- **THEN** the upgrade SHALL proceed without authentication

#### Scenario: External HTTP request without cookie
- **WHEN** an HTTP request arrives from a non-loopback IP with no auth cookie
- **THEN** the server SHALL redirect to `/auth/login` (for HTML requests) or return 401 (for API/JSON requests)

#### Scenario: External WebSocket upgrade without cookie
- **WHEN** a WebSocket upgrade request arrives from a non-loopback IP with no valid auth cookie
- **THEN** the server SHALL reject the upgrade with HTTP 401

### Requirement: OAuth login flow
The auth module SHALL implement the OAuth2 authorization code flow. The `/auth/login` route SHALL display a provider picker page listing all configured providers. If only one provider is configured, it SHALL auto-redirect to that provider's authorize URL.

#### Scenario: Single provider — auto-redirect
- **WHEN** a user visits `/auth/login` and only one provider is configured
- **THEN** the server SHALL redirect to that provider's authorize URL with `client_id`, `redirect_uri`, `scope`, `state`, and `response_type=code`

#### Scenario: Multiple providers — picker page
- **WHEN** a user visits `/auth/login` and multiple providers are configured
- **THEN** the server SHALL return a server-rendered HTML page with a link/button for each provider

#### Scenario: Login with return URL
- **WHEN** a user visits `/auth/login?return=/some/path`
- **THEN** the `state` parameter SHALL encode the return URL so the callback can redirect back after login

### Requirement: OAuth callback handling
The `/auth/callback/:provider` route SHALL exchange the authorization code for an access token, fetch the user's profile (email, display name), validate the user against `allowedEmails` (if configured), issue a signed JWT cookie, and redirect to the return URL (or `/`).

#### Scenario: Successful callback with valid code
- **WHEN** the OAuth provider redirects back with a valid `code` and `state`
- **THEN** the server SHALL exchange the code for an access token, fetch user info, set a JWT cookie, and redirect to `/`

#### Scenario: Callback with return URL in state
- **WHEN** the callback `state` contains a return URL `/sessions`
- **THEN** after successful auth, the server SHALL redirect to `/sessions` instead of `/`

#### Scenario: Callback with invalid code
- **WHEN** the token exchange fails (invalid code, expired, etc.)
- **THEN** the server SHALL redirect to `/auth/login` with an error query parameter

#### Scenario: User not in allowedEmails
- **WHEN** `auth.allowedEmails` is configured and the user's email does not match any entry
- **THEN** the server SHALL return a 403 page explaining access is denied

#### Scenario: allowedEmails not configured
- **WHEN** `auth.allowedEmails` is not set or is an empty array
- **THEN** any authenticated user SHALL be allowed

#### Scenario: allowedEmails with domain wildcard
- **WHEN** `auth.allowedEmails` contains `*@company.com` and the user's email is `user@company.com`
- **THEN** the user SHALL be allowed

### Requirement: JWT session token
The auth module SHALL issue a JWT signed with `auth.secret` from config. The JWT payload SHALL contain `sub` (email), `name` (display name), `provider` (provider key), and `exp` (expiry timestamp). The default expiry SHALL be 7 days. The cookie SHALL be named `pi_dash_token`, set as `HttpOnly`, `Secure` (when not localhost), and `SameSite=Lax`.

#### Scenario: JWT issued on successful login
- **WHEN** OAuth callback succeeds
- **THEN** a JWT with `{ sub, name, provider, exp }` SHALL be signed with `auth.secret` and set as cookie `pi_dash_token`

#### Scenario: Valid JWT on subsequent request
- **WHEN** an external request includes a valid, non-expired `pi_dash_token` cookie
- **THEN** the request SHALL proceed with user info available on the request

#### Scenario: Expired JWT
- **WHEN** an external request includes an expired `pi_dash_token` cookie
- **THEN** the server SHALL clear the cookie and redirect to `/auth/login`

#### Scenario: Tampered JWT
- **WHEN** an external request includes a JWT with an invalid signature
- **THEN** the server SHALL clear the cookie and return 401

### Requirement: Auth secret management
The auth module SHALL use `auth.secret` from config to sign JWTs. If `auth` is configured but `auth.secret` is missing, the module SHALL auto-generate a random 32-character hex string, write it back to the config file, and use it.

#### Scenario: Secret provided in config
- **WHEN** `auth.secret` is set in config
- **THEN** the module SHALL use it as the JWT signing key

#### Scenario: Secret missing — auto-generate
- **WHEN** `auth` is configured but `auth.secret` is missing
- **THEN** the module SHALL generate a random 32-character hex string, persist it to `~/.pi/dashboard/config.json`, and use it

### Requirement: Logout
The `POST /auth/logout` route SHALL clear the `pi_dash_token` cookie and redirect to `/auth/login`.

#### Scenario: Logout clears session
- **WHEN** a POST request is made to `/auth/logout`
- **THEN** the server SHALL clear the `pi_dash_token` cookie and redirect to `/auth/login`

### Requirement: Auth status endpoint
The `GET /auth/status` route SHALL return the current authentication state. This endpoint SHALL be accessible without auth (no redirect).

#### Scenario: Authenticated user
- **WHEN** `GET /auth/status` is called with a valid JWT cookie
- **THEN** the server SHALL return `{ authenticated: true, user: { name, email, provider } }`

#### Scenario: Unauthenticated request
- **WHEN** `GET /auth/status` is called without a valid JWT cookie
- **THEN** the server SHALL return `{ authenticated: false }`

#### Scenario: Auth disabled
- **WHEN** `GET /auth/status` is called and no auth is configured
- **THEN** the server SHALL return `{ authenticated: true, authEnabled: false }`

### Requirement: OAuth redirect URI resolution
The auth module SHALL construct the OAuth `redirect_uri` using the tunnel URL when available, falling back to `http://localhost:{port}`. The callback path SHALL be `/auth/callback/:provider`.

#### Scenario: Tunnel URL available
- **WHEN** a tunnel URL has been created (e.g., `https://abc.share.zrok.io`)
- **THEN** the redirect URI SHALL be `https://abc.share.zrok.io/auth/callback/github`

#### Scenario: No tunnel — localhost fallback
- **WHEN** no tunnel is active
- **THEN** the redirect URI SHALL be `http://localhost:8000/auth/callback/github`
