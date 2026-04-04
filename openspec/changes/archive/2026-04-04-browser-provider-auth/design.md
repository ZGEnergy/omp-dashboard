## Context

Pi stores provider credentials in `~/.pi/agent/auth.json` with two formats: `{ type: "oauth", refresh, access, expires, ...extra }` for subscription providers and `{ type: "api_key", key }` for API key providers. The `AuthStorage` class handles file locking, reading, writing, and token refresh. The `ModelRegistry` (accessible from the bridge extension via `ctx.modelRegistry`) exposes `authStorage` as a public readonly property.

Pi has 5 built-in OAuth providers with full login implementations in `@mariozechner/pi-ai/utils/oauth/`:
- **Anthropic**: Auth Code + PKCE → `claude.ai/oauth/authorize` → `platform.claude.com/v1/oauth/token` (port 53692)
- **OpenAI Codex**: Auth Code + PKCE → `auth.openai.com/oauth/authorize` → `auth.openai.com/oauth/token` (port 1455)
- **GitHub Copilot**: Device Code → `github.com/login/device/code` → polls `github.com/login/oauth/access_token`
- **Gemini CLI**: Auth Code + PKCE → Google OAuth → `oauth2.googleapis.com/token` (port 8085) + project discovery
- **Antigravity**: Auth Code + PKCE → Google OAuth → `oauth2.googleapis.com/token` (port 51121) + project discovery

The dashboard server already handles OAuth for *dashboard access* (`src/server/auth.ts`). This new feature is separate — it authenticates pi sessions with LLM providers.

## Goals / Non-Goals

**Goals:**
- Users can authenticate with all 5 OAuth providers from the dashboard browser (Settings page)
- Users can enter/remove API keys for non-OAuth providers from Settings
- Credentials are written to `~/.pi/agent/auth.json` in pi's native format
- Running pi sessions pick up new credentials immediately
- Works both on localhost and via tunnel (with manual URL paste fallback)

**Non-Goals:**
- Token refresh daemon — pi already handles token refresh internally
- Multi-account support — pi's `auth.json` supports one credential per provider
- Replacing pi's `/login` command — this is an alternative path, not a replacement
- Browser-side token exchange — all secrets stay server-side

## Decisions

### 1. Server-side token exchange, not browser-side

**Decision**: The dashboard server generates PKCE pairs, builds auth URLs, and exchanges codes for tokens. The browser only opens the popup and relays the authorization code back.

**Why**: PKCE code verifiers and client secrets (Google providers) must never reach the browser. Server-to-provider fetch is also more reliable (no CORS issues).

**Alternative**: Browser-side exchange with PKCE — rejected because Google providers require `client_secret` which cannot be exposed to the browser.

### 2. Direct `auth.json` write + bridge reload notification

**Decision**: Server writes credentials directly to `auth.json` using atomic write with `0600` permissions, then broadcasts `credentials_updated` to all connected bridges. Bridges call `authStorage.reload()` to pick up new tokens.

**Why**: Works even with zero running pi sessions. Bridge notification ensures running sessions get credentials immediately without waiting for the next token refresh cycle.

**Alternative**: Route everything through a bridge extension's `authStorage.set()` — rejected because it requires at least one running session, and `authStorage.set()` does the same atomic file write internally.

### 3. Provider-specific OAuth handlers as a registry pattern

**Decision**: Each provider is a `ProviderOAuthHandler` with methods: `getAuthUrl(redirectUri, state, pkce)`, `exchangeCode(code, redirectUri, pkce)`, `mapCredentials(tokens)`. Device code providers (GitHub Copilot) have `getDeviceCode()` and `pollToken(deviceCode)` instead. All handlers live in `src/server/provider-auth-handlers.ts`.

**Why**: Each provider has different quirks (JSON vs form-urlencoded exchange, fixed ports, project discovery, JWT parsing). A registry keeps the route handler clean.

**Alternative**: Generic OAuth handler with config-driven differences — rejected because the providers diverge too much (device code vs auth code, project discovery steps, token format differences).

### 4. Dashboard as redirect URI (not fixed localhost ports)

**Decision**: Use the dashboard server's own URL as the OAuth redirect URI (e.g., `http://localhost:9998/api/provider-auth/callback/anthropic`), not the fixed ports each provider's CLI uses (53692, 1455, etc.).

**Why**: The fixed ports are for pi's CLI login flow which starts its own temporary HTTP server. The dashboard is already a running HTTP server, so we use its own port. This also works via tunnel — the redirect comes back to the dashboard regardless.

**Caveat**: OAuth providers may enforce registered redirect URIs. Anthropic uses `localhost:53692`, OpenAI uses `localhost:1455`. If the provider rejects our redirect URI, we fall back to starting a temporary local server on the fixed port (same as pi's CLI) and relaying the code internally. Google providers use `localhost:8085` and `localhost:51121` respectively. We need to test whether these providers accept custom redirect URIs. If not, the server starts a temporary listener on the fixed port, and the callback page serves as a fallback relay.

**Fallback**: If redirect URI restrictions prevent using the dashboard port, use pi's own port-based listeners. The server spawns a temporary `http.createServer` on the provider's expected port, receives the callback, and completes the exchange internally. The browser popup would redirect to this temporary server. This matches how pi's CLI already works.

### 5. OAuth popup + postMessage relay for auth-code providers

**Decision**: For auth-code providers (Anthropic, Codex, Gemini, Antigravity), the browser opens a popup to the provider's consent screen. The redirect lands on a `/api/provider-auth/callback/:provider` route that serves a small HTML page. That page extracts `code` and `state` from the URL and relays them back to the opener via `window.opener.postMessage()`, with `BroadcastChannel` and `localStorage` as fallbacks.

**Why**: This is the standard browser OAuth pattern. The triple-relay (postMessage + BroadcastChannel + localStorage) handles edge cases like popup blockers and cross-tab scenarios.

### 6. Device code flow for GitHub Copilot in a modal

**Decision**: GitHub Copilot uses device code flow. The Settings UI shows a modal with the verification URL and user code. The server polls `github.com/login/oauth/access_token` until the user completes authorization, then resolves. An additional prompt asks for GitHub Enterprise domain (blank = github.com) before starting the flow.

**Why**: Device code flow doesn't need a redirect URI — the user visits a URL and enters a code on any device. This works perfectly for remote access.

### 7. Minimal auth.json format compliance

**Decision**: Write credentials in exactly the format pi expects:
```json
{
  "anthropic": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1234567890 },
  "openai-codex": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1234567890, "accountId": "..." },
  "github-copilot": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1234567890, "enterpriseUrl": "..." },
  "google-gemini-cli": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1234567890, "projectId": "..." },
  "google-antigravity": { "type": "oauth", "refresh": "...", "access": "...", "expires": 1234567890, "projectId": "..." },
  "openai": { "type": "api_key", "key": "sk-..." }
}
```

Expiry is calculated as `Date.now() + expires_in * 1000 - 5 * 60 * 1000` (5-minute buffer), matching pi's convention.

### 8. File locking for auth.json writes

**Decision**: Use a simple lockfile (`auth.json.lock`) with retry logic when writing, matching the approach used by pi's `FileAuthStorageBackend`.

**Why**: Multiple pi sessions and the dashboard server may try to write concurrently. File locking prevents corruption.

## Risks / Trade-offs

**[Redirect URI rejection]** → Providers may reject non-registered redirect URIs. Mitigation: test each provider; fall back to temporary server on the fixed port if needed. The fallback is identical to how pi's CLI works.

**[Client secrets in server code]** → Google providers require `client_secret` which is embedded in pi's source code (base64-encoded). We'll do the same — these are public OAuth clients (installed app flow), so the secrets are not truly confidential. → Accept as standard practice for installed/public OAuth clients.

**[Tunnel + popup interaction]** → When accessed via tunnel, the OAuth popup redirects to the dashboard's tunnel URL. Cookie SameSite and cross-origin postMessage may need attention. → Test with zrok tunnel; provide manual URL paste fallback in all cases.

**[auth.json permission on creation]** → If `auth.json` doesn't exist, the server creates it with `0600`. If it exists, we preserve existing permissions. → Use `fs.stat` before write to check; create with `{ mode: 0o600 }`.

**[Google project discovery complexity]** → Gemini CLI and Antigravity require a post-login project discovery step that may involve provisioning (slow). → Show progress in the UI; handle timeout gracefully.
