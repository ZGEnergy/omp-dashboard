## 1. Config & Dependencies

- [ ] 1.1 Add `@fastify/cookie` and `jsonwebtoken` (+ `@types/jsonwebtoken`) to `package.json`
- [ ] 1.2 Extend `DashboardConfig` in `src/shared/config.ts` with optional `auth` field (`AuthConfig` type: `secret`, `providers`, `allowedEmails`)
- [ ] 1.3 Update `loadConfig()` to parse `auth` section — treat empty/missing providers as `undefined`
- [ ] 1.4 Write tests for config loading with auth present, partial, empty providers, and missing

## 2. Tunnel URL Accessor

- [ ] 2.1 Add `getTunnelUrl()` export to `src/server/tunnel.ts` — returns the active tunnel URL or null
- [ ] 2.2 Clear stored URL in `deleteTunnel()`, set it in `createTunnel()`
- [ ] 2.3 Write tests for `getTunnelUrl()` lifecycle (created → available, deleted → null)

## 3. OAuth Provider Registry

- [ ] 3.1 Create `src/server/auth.ts` with `OAuthProviderConfig` type and provider registry builder
- [ ] 3.2 Implement built-in GitHub provider (hardcoded authorize/token/userinfo URLs, `user:email` scope)
- [ ] 3.3 Implement OIDC discovery fetch for Google, Keycloak, and generic OIDC providers
- [ ] 3.4 Write tests for provider registry construction from config (each provider type, empty providers)

## 4. Auth Secret Management

- [ ] 4.1 Implement `ensureAuthSecret()` — auto-generate 32-char hex if `auth.secret` is missing, write back to config file
- [ ] 4.2 Write tests for secret auto-generation and persistence

## 5. JWT Session Token

- [ ] 5.1 Implement `signToken(payload, secret)` and `verifyToken(token, secret)` helpers wrapping `jsonwebtoken`
- [ ] 5.2 Token payload: `{ sub (email), name, provider, exp (7 days) }`
- [ ] 5.3 Write tests for sign/verify, expired tokens, tampered tokens

## 6. Auth Routes

- [ ] 6.1 Implement `GET /auth/login` — provider picker page (server-rendered HTML), auto-redirect if single provider
- [ ] 6.2 Implement `GET /auth/callback/:provider` — code exchange, user info fetch, email validation, JWT cookie set, redirect
- [ ] 6.3 Implement `POST /auth/logout` — clear cookie, redirect to `/auth/login`
- [ ] 6.4 Implement `GET /auth/status` — return `{ authenticated, user?, authEnabled? }`
- [ ] 6.5 Construct redirect URI using `getTunnelUrl()` with localhost fallback
- [ ] 6.6 Write tests for each route (success, error, email not allowed, expired code)

## 7. Auth Hook (HTTP)

- [ ] 7.1 Register `@fastify/cookie` plugin in server when auth is enabled
- [ ] 7.2 Implement `onRequest` hook: skip for localhost (`isLoopback`), skip for `/auth/*` paths, validate JWT cookie for external requests
- [ ] 7.3 Redirect to `/auth/login?return=<original-url>` for HTML requests, return 401 JSON for API requests
- [ ] 7.4 Write tests for hook behavior: localhost bypass, external with valid cookie, external without cookie, expired cookie

## 8. WebSocket Upgrade Auth

- [ ] 8.1 Extract cookie parsing helper (reusable between HTTP hook and upgrade handler)
- [ ] 8.2 Add auth check in `server.ts` `upgrade` handler — parse cookie from headers, validate JWT for non-localhost requests
- [ ] 8.3 Destroy socket with 401 response if auth fails on external WebSocket upgrade
- [ ] 8.4 Write tests for WebSocket upgrade auth (localhost pass-through, external valid, external invalid)

## 9. Server Integration

- [ ] 9.1 Conditionally register auth plugin in `createServer()` based on config
- [ ] 9.2 Pass tunnel URL to auth module after tunnel creation (sequence: listen → tunnel → auth redirect URI)
- [ ] 9.3 Ensure `/auth/*` routes are excluded from existing `localhostGuard`
- [ ] 9.4 Integration test: server starts with auth config, login flow works end-to-end

## 10. Client Auth Handling

- [ ] 10.1 Add WebSocket disconnect handler in `App.tsx` — detect 401 and show "Session expired" banner with login link
- [ ] 10.2 On initial load, call `GET /auth/status` to check auth state (for showing user info or login prompt)

## 11. Documentation

- [ ] 11.1 Update `AGENTS.md` with `src/server/auth.ts` in key files table
- [ ] 11.2 Update `docs/architecture.md` with auth flow description
- [ ] 11.3 Update `README.md` with auth configuration section (provider setup, callback URLs, `allowedEmails`)
