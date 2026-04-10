## ADDED Requirements

### Requirement: CORS enabled on dashboard server
The server SHALL register `@fastify/cors` to handle cross-origin requests from separately-hosted clients.

#### Scenario: Same-origin requests pass through
- **WHEN** a request has no `Origin` header (same-origin)
- **THEN** the server SHALL process it normally without CORS headers

#### Scenario: Localhost origins allowed by default
- **WHEN** a request comes from `http://localhost:3000` or `http://127.0.0.1:5173` or any localhost port
- **THEN** the server SHALL respond with `Access-Control-Allow-Origin` matching the request origin

#### Scenario: Configured origins allowed
- **WHEN** `cors.allowedOrigins` in config contains `https://dashboard.example.com`
- **AND** a request comes from `https://dashboard.example.com`
- **THEN** the server SHALL respond with matching `Access-Control-Allow-Origin`

#### Scenario: Unknown origins rejected
- **WHEN** a request comes from `https://evil.example.com` not in config
- **THEN** the server SHALL reject the CORS preflight

### Requirement: CORS credentials support
The server SHALL set `Access-Control-Allow-Credentials: true` to support cross-origin auth cookies.

#### Scenario: Cross-origin auth cookies forwarded
- **WHEN** a cross-origin request includes credentials (cookies)
- **THEN** the server SHALL accept and process the cookies

### Requirement: CORS config field
The dashboard config (`~/.pi/dashboard/config.json`) SHALL support a `cors` object with an `allowedOrigins` string array.

#### Scenario: Config with allowed origins
- **WHEN** config contains `{ "cors": { "allowedOrigins": ["https://ui.example.com"] } }`
- **THEN** the server SHALL allow requests from `https://ui.example.com`

#### Scenario: No cors config uses defaults
- **WHEN** config has no `cors` field
- **THEN** the server SHALL allow only localhost origins (plus same-origin)
