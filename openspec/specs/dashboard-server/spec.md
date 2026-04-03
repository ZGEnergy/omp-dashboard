## ADDED Requirements

### Requirement: Shutdown REST endpoint
The dashboard server SHALL expose a `POST /api/shutdown` endpoint that gracefully stops the server process. When called, it SHALL invoke the server's `stop()` method and then exit the process with code 0.

#### Scenario: Shutdown request
- **WHEN** a `POST /api/shutdown` request is received
- **THEN** the server SHALL respond with `{ ok: true }`, call `server.stop()`, and exit with `process.exit(0)`

#### Scenario: Shutdown during active sessions
- **WHEN** `POST /api/shutdown` is received while pi sessions are connected
- **THEN** the server SHALL still shut down gracefully — connected extensions will reconnect when a new server starts

### Requirement: Health endpoint
The dashboard server SHALL expose a `GET /api/health` endpoint that returns server liveness information including process ID and uptime.

#### Scenario: Health check response
- **WHEN** a `GET /api/health` request is received
- **THEN** the server SHALL respond with `{ ok: true, pid: <number>, uptime: <seconds> }`

#### Scenario: Health check from localhost
- **WHEN** a `GET /api/health` request is received from any origin
- **THEN** the server SHALL respond successfully (no localhost guard on health endpoint)

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

### Requirement: Config REST endpoints
The server SHALL expose `GET /api/config` and `PUT /api/config` endpoints, both protected by `localhostGuard`.

#### Scenario: Config endpoints registered
- **WHEN** the server starts
- **THEN** `GET /api/config` and `PUT /api/config` SHALL be available with `localhostGuard` preHandler

### Requirement: Runtime config reload
The server SHALL support runtime config reloading when `PUT /api/config` is called. A `reloadConfig(partial)` function SHALL merge, persist, and apply changes to the running server instance.

#### Scenario: Config reload applies runtime changes
- **WHEN** `PUT /api/config` writes new config
- **THEN** the server SHALL call `reloadConfig()` to apply hot-swappable settings

### Requirement: Session prompt REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/prompt` endpoint that sends a text prompt to the specified session. The endpoint SHALL accept a JSON body with `text` (required) and optional `images` array.

#### Scenario: Send prompt to active session
- **WHEN** a `POST /api/session/:id/prompt` request is received with `{ "text": "hello" }`
- **THEN** the server SHALL forward the prompt to the pi session via the pi-gateway and respond with `{ success: true }`

#### Scenario: Send prompt to unknown session
- **WHEN** a `POST /api/session/:id/prompt` request is received for a non-existent session
- **THEN** the server SHALL respond with `{ success: false, error: "session not found" }`

### Requirement: Session abort REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/abort` endpoint that aborts the current operation in the specified session.

#### Scenario: Abort active session
- **WHEN** a `POST /api/session/:id/abort` request is received for a connected session
- **THEN** the server SHALL send an abort message to the pi session and respond with `{ success: true }`

### Requirement: Session shutdown REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/shutdown` endpoint that shuts down the specified pi session (not the server).

#### Scenario: Shutdown connected session
- **WHEN** a `POST /api/session/:id/shutdown` request is received for a connected session
- **THEN** the server SHALL send a shutdown message to the pi session and respond with `{ success: true }`

### Requirement: Session rename REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/rename` endpoint that renames the specified session. The endpoint SHALL accept a JSON body with `name` (required string).

#### Scenario: Rename session
- **WHEN** a `POST /api/session/:id/rename` request is received with `{ "name": "my-session" }`
- **THEN** the server SHALL update the session name in the session manager, forward to the pi session, and respond with `{ success: true }`

### Requirement: Session hide/unhide REST endpoints
The dashboard server SHALL expose `POST /api/session/:id/hide` and `POST /api/session/:id/unhide` endpoints.

#### Scenario: Hide session
- **WHEN** a `POST /api/session/:id/hide` request is received
- **THEN** the server SHALL set `hidden: true` on the session and respond with `{ success: true }`

#### Scenario: Unhide session
- **WHEN** a `POST /api/session/:id/unhide` request is received
- **THEN** the server SHALL set `hidden: false` on the session and respond with `{ success: true }`

### Requirement: Session spawn REST endpoint
The dashboard server SHALL expose a `POST /api/session/spawn` endpoint that spawns a new pi session. The endpoint SHALL accept a JSON body with `cwd` (required string).

#### Scenario: Spawn session
- **WHEN** a `POST /api/session/spawn` request is received with `{ "cwd": "/path/to/project" }`
- **THEN** the server SHALL spawn a new pi session in the specified directory and respond with `{ success: true }`

### Requirement: Session resume REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/resume` endpoint that resumes or forks an ended session. The endpoint SHALL accept a JSON body with `mode` ("continue" or "fork").

#### Scenario: Resume ended session
- **WHEN** a `POST /api/session/:id/resume` request is received with `{ "mode": "continue" }`
- **THEN** the server SHALL resume the session and respond with `{ success: true }`

### Requirement: Flow control REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/flow-control` endpoint. The endpoint SHALL accept a JSON body with `action` ("abort" or "toggle_autonomous").

#### Scenario: Abort flow
- **WHEN** a `POST /api/session/:id/flow-control` request is received with `{ "action": "abort" }`
- **THEN** the server SHALL forward the flow control message to the pi session and respond with `{ success: true }`

### Requirement: Set model REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/model` endpoint. The endpoint SHALL accept a JSON body with `provider` and `modelId` (both required strings).

#### Scenario: Set model on session
- **WHEN** a `POST /api/session/:id/model` request is received with `{ "provider": "anthropic", "modelId": "claude-sonnet-4-20250514" }`
- **THEN** the server SHALL forward the set-model message to the pi session and respond with `{ success: true }`

### Requirement: Set thinking level REST endpoint
The dashboard server SHALL expose a `POST /api/session/:id/thinking-level` endpoint. The endpoint SHALL accept a JSON body with `level` (required string).

#### Scenario: Set thinking level
- **WHEN** a `POST /api/session/:id/thinking-level` request is received with `{ "level": "high" }`
- **THEN** the server SHALL forward the thinking-level message to the pi session and respond with `{ success: true }`

### Requirement: Attach/detach proposal REST endpoints
The dashboard server SHALL expose `POST /api/session/:id/attach-proposal` and `POST /api/session/:id/detach-proposal` endpoints. Attach accepts `{ "changeName": "..." }`.

#### Scenario: Attach proposal
- **WHEN** a `POST /api/session/:id/attach-proposal` request is received with `{ "changeName": "add-feature" }`
- **THEN** the server SHALL update the session's attached proposal and respond with `{ success: true }`

#### Scenario: Detach proposal
- **WHEN** a `POST /api/session/:id/detach-proposal` request is received
- **THEN** the server SHALL clear the session's attached proposal and respond with `{ success: true }`
