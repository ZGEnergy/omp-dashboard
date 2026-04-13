## Context

The dashboard's provider auth reuses OAuth client IDs from pi's CLI (`pi-ai` package) but constructs redirect URIs using the dashboard's own port and path. OAuth providers whitelist specific redirect URIs per client ID. The mismatch causes authorization failures.

Additionally, Electron's popup windows don't reliably support `window.opener.postMessage` cross-origin, and `BroadcastChannel`/`localStorage` are same-origin only — so the current browser relay mechanism breaks when the callback port differs from the dashboard port.

Registered redirect URIs (from pi-ai source):

| Provider | Redirect URI |
|----------|-------------|
| Anthropic | `http://localhost:53692/callback` |
| OpenAI Codex | `http://localhost:1455/auth/callback` |
| Gemini CLI | `http://localhost:8085/oauth2callback` |
| Antigravity | `http://localhost:51121/oauth-callback` |

## Goals / Non-Goals

**Goals:**
- OAuth login works for all auth-code providers (Anthropic, Codex, Gemini CLI, Antigravity)
- Use the exact redirect URIs registered with each provider's OAuth client
- Works identically in Electron app and regular browser access

**Non-Goals:**
- Registering new redirect URIs with providers (not possible — third-party OAuth clients)
- Changing device-code flows (GitHub Copilot — already works)
- Changing the client-side auth UI beyond removing the popup relay

## Decisions

### 1. Open system browser for OAuth, not a popup window

**Decision**: Use the system's default browser (`open` on macOS, `xdg-open` on Linux, `start` on Windows) for the OAuth authorization page. The dashboard server opens the URL server-side.

**Why**: Eliminates all cross-origin relay problems. Works identically in Electron and regular browser. This is exactly what pi CLI does.

**Alternative considered**: Fix the popup relay with correct ports. Still fragile — `BroadcastChannel` and `localStorage` are same-origin only, and `window.opener` is unreliable in Electron.

### 2. Temp callback server does the full token exchange

**Decision**: The temporary callback server on the provider's registered port receives the authorization code, exchanges it for tokens server-side, saves the credential, and notifies connected clients via WebSocket.

**Why**: No client-side relay needed. The server already has `notifyBridges()` which broadcasts `credentials_updated` to all connected extensions. We add a similar WebSocket notification to browser clients so the UI updates.

### 3. Auth-code handlers declare registered redirect URI components

**Decision**: Add `callbackPort` and `callbackPath` fields to `AuthCodeHandler`. Each handler declares its registered redirect URI components.

**Why**: Keeps provider-specific config co-located with the handler.

### 4. Browser client polls or listens for auth completion

**Decision**: After the server opens the system browser, the client polls `GET /api/provider-auth/status` or listens for a WebSocket `provider_auth_complete` message to detect when the flow finishes.

**Why**: Simple, no cross-origin issues. The client just needs to know when to refresh the auth status display.

### 5. Remove popup relay mechanism

**Decision**: Remove `callbackHtml()` with `postMessage`/`BroadcastChannel`/`localStorage` relay. Replace with simple success/error HTML page shown in the system browser tab.

### 6. Keep `/api/provider-auth/callback/:provider` route removed

**Decision**: The dashboard's own callback route is no longer needed since the temp server handles callbacks directly.

## Risks / Trade-offs

- **Port already in use** → Return a clear error ("Port 53692 is in use — close any running pi login and try again"). Same constraint pi CLI has.
- **Multiple concurrent auth flows for same provider** → Only one at a time per provider (same port). Close existing temp server before starting new one.
- **Headless/remote server** → System browser won't work on a headless server. But OAuth login is inherently interactive — user must be present. For remote access via tunnel, the user can use API keys instead.
- **Temp server cleanup** → 5-minute timeout, `server.close()` in all exit paths.
