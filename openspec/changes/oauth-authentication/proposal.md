## Why

The dashboard server binds to `0.0.0.0` and can be exposed publicly via zrok tunnel, but has zero authentication — anyone with the tunnel URL gets full access to all sessions, terminals, and commands. OAuth authentication is needed to protect the dashboard when accessed remotely, while keeping localhost access frictionless (no login required).

## What Changes

- Add optional OAuth2 authentication middleware for the Fastify HTTP server
- Support three built-in OAuth providers: **Keycloak**, **GitHub**, **Google** — plus a generic OIDC provider for any standards-compliant IdP
- Auth is **only enforced for non-localhost requests** (tunnel/external access). Localhost remains unguarded as today
- Use `@fastify/oauth2` for OAuth2 flows, `@fastify/cookie` + `@fastify/secure-session` (or signed JWT cookies) for session persistence
- WebSocket connections (browser gateway, terminal gateway) validate the same session cookie/token on upgrade
- Pi gateway (extension↔server on port 9999) remains unauthenticated — it's localhost-only by design
- OAuth provider configuration lives in `~/.pi/dashboard/config.json` under a new `auth` key
- When no `auth` config is present, auth is completely disabled (current behavior preserved)

## Capabilities

### New Capabilities
- `oauth-authentication`: OAuth2/OIDC authentication layer — provider configuration, login/callback flow, session management, WebSocket auth, and localhost bypass logic

### Modified Capabilities
- `zrok-tunnel`: Tunnel spec should note that when auth is configured, external access requires login. The zrok `authScheme` field remains `"none"` (auth is handled at the application layer, not zrok layer)
- `shared-config`: Config schema gains an `auth` section for OAuth provider settings
- `dashboard-server`: Server startup conditionally registers OAuth plugin and auth hooks

## Impact

- **New dependencies**: `@fastify/oauth2`, `@fastify/cookie`, `@fastify/secure-session` (or `jsonwebtoken` for JWT approach)
- **Server routes**: New `/auth/login`, `/auth/callback/:provider`, `/auth/logout` routes
- **Client**: Needs a login redirect flow and error page for 401s when accessing via tunnel. Minimal UI — just redirect to provider
- **Config**: New `auth` section in `~/.pi/dashboard/config.json` with provider credentials (client ID, secret, discovery URL)
- **WebSocket upgrade**: Browser gateway and terminal gateway need to check auth token on connection upgrade
- **No breaking changes**: Auth is opt-in. Without config, everything works exactly as today
- **Pi gateway unaffected**: Extension↔server communication stays on localhost port 9999, no auth needed
