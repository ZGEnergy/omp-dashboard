## ADDED Requirements

### Requirement: Conditional auth plugin registration
The server SHALL register the auth module as a Fastify plugin only when `auth` is present in the loaded config and has at least one provider configured. When auth is not configured, no auth hooks or routes SHALL be registered.

#### Scenario: Auth configured with providers
- **WHEN** the server starts and config contains `auth` with at least one provider
- **THEN** the server SHALL register the auth plugin, adding auth routes and the `onRequest` hook

#### Scenario: Auth not configured
- **WHEN** the server starts and config has no `auth` key
- **THEN** the server SHALL not register any auth plugin, hooks, or routes

### Requirement: WebSocket upgrade auth check
The server's `upgrade` handler SHALL validate authentication for non-localhost WebSocket upgrade requests when auth is enabled. The check SHALL parse the `cookie` header from the upgrade request and validate the JWT.

#### Scenario: External WebSocket upgrade with valid cookie
- **WHEN** a non-localhost WebSocket upgrade request includes a valid `pi_dash_token` cookie
- **THEN** the upgrade SHALL proceed normally

#### Scenario: External WebSocket upgrade without valid cookie
- **WHEN** a non-localhost WebSocket upgrade request has no valid `pi_dash_token` cookie and auth is enabled
- **THEN** the server SHALL destroy the socket with HTTP 401

#### Scenario: Localhost WebSocket upgrade — no check
- **WHEN** a localhost WebSocket upgrade request arrives (regardless of auth config)
- **THEN** the upgrade SHALL proceed without cookie validation

### Requirement: Auth routes excluded from localhost guard
The auth routes (`/auth/*`) SHALL NOT be subject to the localhost guard. They MUST be accessible from external IPs so that OAuth callbacks and login flows work through the tunnel.

#### Scenario: External access to /auth/callback
- **WHEN** a non-localhost request hits `/auth/callback/github`
- **THEN** the request SHALL be processed (not blocked by localhost guard)

#### Scenario: External access to /auth/login
- **WHEN** a non-localhost request hits `/auth/login`
- **THEN** the request SHALL return the login page or redirect to the provider
