## Context

The dashboard server listens on `0.0.0.0:8000` and can be exposed publicly via a zrok tunnel. Currently, there is no authentication — the only protection is `localhostGuard` on sensitive REST routes. When accessed via tunnel, anyone with the URL has full access to sessions, terminals, and commands.

The server uses Fastify 5 with `@fastify/static` and `@fastify/websocket`. WebSocket upgrade is handled manually in `server.ts` for browser gateway (`/ws`) and terminal gateway (`/ws/terminal/:id`). The pi gateway runs on a separate port (9999) and is localhost-only.

Configuration lives in `~/.pi/dashboard/config.json` via `src/shared/config.ts`, with a `DashboardConfig` interface and `loadConfig()` function.

## Goals / Non-Goals

**Goals:**
- Protect external (non-localhost) access with OAuth2 authentication
- Support Keycloak, GitHub, Google out of the box, plus generic OIDC
- Zero friction for localhost — no login, no config needed
- Opt-in: no `auth` config = disabled, identical to current behavior
- Single new module (`src/server/auth.ts`) encapsulating all auth logic

**Non-Goals:**
- User roles / authorization (all authenticated users have full access)
- Multi-user session isolation (all users see all sessions)
- Local user/password accounts
- Auth for pi gateway (port 9999) — stays localhost-only, unauthed
- SAML or non-OAuth protocols

## Decisions

### 1. Lightweight custom OAuth2 module over `@fastify/oauth2`

**Decision**: Build a thin custom OAuth2 module (`src/server/auth.ts`) using direct `fetch()` calls instead of `@fastify/oauth2`.

**Rationale**: The `@fastify/oauth2` plugin is designed for multi-provider registration at startup time and adds complexity for our use case. We only need:
- Redirect to provider's authorize URL
- Exchange code for token at callback
- Fetch user profile

These are 3 simple HTTP calls. A custom module keeps dependencies minimal (same pattern as `tunnel.ts` which uses raw `fetch()` for zrok API). The module can support any number of providers via a provider config map.

**Alternative considered**: `@fastify/oauth2` — heavier dependency, more abstractions to work around for our conditional-auth pattern.

### 2. Signed JWT cookie for session persistence

**Decision**: On successful OAuth callback, issue a signed JWT stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The JWT contains the user's display name, email, and provider. Validated on each request via a Fastify `onRequest` hook.

**Rationale**: JWT cookies are stateless — no server-side session store needed. The server already has no session state for browser users. `@fastify/cookie` is a lightweight dependency for cookie parsing; `jsonwebtoken` for signing/verification.

**Alternative considered**: `@fastify/secure-session` with sodium — adds native dependency (`sodium-native`), overkill for our needs since we don't need server-side session data.

### 3. Auth only on non-localhost requests (conditional hook)

**Decision**: The Fastify `onRequest` hook checks `isLoopback(request.ip)` first. If localhost, skip auth entirely. If external, validate JWT cookie. This reuses the existing `isLoopback()` from `localhost-guard.ts`.

**Rationale**: Keeps localhost development frictionless. The hook runs before route handlers, so all routes (REST, static assets, API) are protected uniformly.

### 4. WebSocket auth via cookie on upgrade

**Decision**: The `upgrade` handler in `server.ts` parses the cookie from the HTTP upgrade request headers before calling `handleUpgrade`. If auth is enabled and the request is non-localhost, validate the JWT from the cookie. Reject with 401 if invalid.

**Rationale**: Browsers automatically send cookies on WebSocket upgrade requests. No need for a custom token parameter or query string auth.

### 5. Provider configuration in config.json

**Decision**: Add an `auth` section to `DashboardConfig`:

```json
{
  "auth": {
    "secret": "random-32-char-string",
    "providers": {
      "github": {
        "clientId": "...",
        "clientSecret": "..."
      },
      "google": {
        "clientId": "...",
        "clientSecret": "..."
      },
      "keycloak": {
        "clientId": "...",
        "clientSecret": "...",
        "issuerUrl": "https://keycloak.example.com/realms/myrealm"
      },
      "oidc": {
        "clientId": "...",
        "clientSecret": "...",
        "issuerUrl": "https://idp.example.com",
        "name": "Corporate SSO"
      }
    },
    "allowedEmails": ["user@example.com"]
  }
}
```

- `secret`: Used to sign JWTs. Auto-generated on first config write if missing.
- `providers`: Map of provider name → credentials. Only configured providers are available.
- `allowedEmails` (optional): Whitelist. If omitted, any authenticated user is allowed.

**Built-in provider endpoints** (well-known, no discovery needed):
- GitHub: `https://github.com/login/oauth/authorize`, token at `https://github.com/login/oauth/access_token`, profile at `https://api.github.com/user`
- Google: Uses OIDC discovery at `https://accounts.google.com/.well-known/openid-configuration`
- Keycloak: Uses OIDC discovery at `{issuerUrl}/.well-known/openid-configuration`
- Generic OIDC: Uses discovery at `{issuerUrl}/.well-known/openid-configuration`

### 6. Minimal client-side auth handling

**Decision**: No login page in the React app. When a 401 is received:
- HTTP: Server redirects to `/auth/login` which shows a simple provider picker (server-rendered HTML) or auto-redirects if only one provider is configured.
- WebSocket: On connection failure, client shows a "Session expired — click to login" banner.

**Rationale**: Keeps client changes minimal. The OAuth flow happens entirely server-side with redirects. The React app just needs to handle 401 on WebSocket disconnect.

### 7. Auth routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/login` | GET | Provider picker page (or auto-redirect if single provider) |
| `/auth/callback/:provider` | GET | OAuth callback — exchanges code, sets cookie, redirects to `/` |
| `/auth/logout` | POST | Clears cookie, redirects to `/auth/login` |
| `/auth/status` | GET | Returns `{ authenticated: boolean, user?: { name, email, provider } }` |

## Risks / Trade-offs

- **[JWT secret management]** → The `secret` in config.json is stored in plaintext. Mitigation: file permissions on `~/.pi/dashboard/config.json` should be `600`. Document this. Auto-generate a random secret if not provided.
- **[Cookie not sent cross-origin]** → If the zrok tunnel URL differs from the callback URL, cookies may not be set. Mitigation: The callback URL must use the tunnel URL as the base. The server detects the tunnel URL and uses it for OAuth redirect URIs.
- **[GitHub doesn't support OIDC]** → GitHub uses OAuth2 but not OIDC (no `id_token`, no discovery). Mitigation: GitHub provider has hardcoded endpoints and uses the `/user` API for profile data.
- **[Token expiry]** → JWT tokens need an expiry. Default to 7 days. After expiry, user is redirected to login again.
- **[Callback URL registration]** → Users must register the correct callback URL in their OAuth provider. This is provider-specific and must be documented clearly. The callback URL includes the tunnel URL which changes on each server restart (unless zrok reserved). Mitigation: Document this limitation. For stable URLs, recommend zrok reserved shares.

## Open Questions

- Should we support `allowedEmails` as glob patterns (e.g., `*@company.com`) or exact matches only?
- Should the JWT expiry be configurable, or is 7 days a sensible fixed default?
