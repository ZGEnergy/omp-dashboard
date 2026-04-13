# OAuth Redirect URI Fix

## Problem

OAuth login for Anthropic (and potentially other providers) fails from the dashboard with:

> Authorization failed — Redirect URI `http://localhost:8000/api/provider-auth/callback/anthropic` is not supported by client.

The dashboard reuses pi's OAuth client IDs but constructs its own redirect URIs using the dashboard's port and path. Each provider's OAuth client has a **whitelist of allowed redirect URIs** registered server-side. The dashboard's URIs are not on those whitelists.

### Registered redirect URIs (from pi-ai)

| Provider | Port | Path | Full URI |
|----------|------|------|----------|
| Anthropic | 53692 | `/callback` | `http://localhost:53692/callback` |
| Gemini CLI | 8085 | `/oauth2callback` | `http://localhost:8085/oauth2callback` |
| Antigravity | 51121 | `/oauth-callback` | `http://localhost:51121/oauth-callback` |
| OpenAI Codex | (dynamic) | (dynamic) | (needs investigation — may use same pattern) |

## Solution

For auth-code providers, spin up a **temporary HTTP server on the provider's registered callback port** to receive the OAuth redirect. The temp server captures the authorization code and relays it to the dashboard server for token exchange.

### Flow

1. Browser clicks "Login with Anthropic" → dashboard `POST /api/provider-auth/authorize`
2. Server starts a temp HTTP server on port 53692 (Anthropic's registered port)
3. Server returns the auth URL with `redirect_uri=http://localhost:53692/callback`
4. Browser opens popup to Anthropic's auth page
5. After user authorizes, Anthropic redirects to `http://localhost:53692/callback?code=...&state=...`
6. Temp server receives the callback, serves the existing relay HTML, then shuts down
7. Browser popup relays code back via `postMessage` / `BroadcastChannel` / `localStorage`
8. Dashboard exchanges code for tokens via `POST /api/provider-auth/exchange` (unchanged)

### Changes

**`packages/server/src/provider-auth-handlers.ts`**
- Add `callbackPort` and `callbackPath` to `AuthCodeHandler` interface
- Set correct values for each provider (Anthropic: 53692/`/callback`, Gemini: 8085/`/oauth2callback`, Antigravity: 51121/`/oauth-callback`)

**`packages/server/src/oauth-callback-server.ts`** (new)
- `startCallbackServer(port, path, timeoutMs)` — starts a temp HTTP server, returns a promise that resolves with `{code, state}` when the callback is received
- Auto-closes after timeout (e.g. 5 minutes)
- Serves the existing `callbackHtml()` response so the browser relay mechanism stays unchanged

**`packages/server/src/routes/provider-auth-routes.ts`**
- In the `/authorize` handler: use `handler.callbackPort` and `handler.callbackPath` to construct the redirect URI
- Start the temp callback server before returning the auth URL
- The callback server captures `code`/`state` and makes them available for the `/exchange` endpoint

**OpenAI Codex**
- Needs investigation — check if it uses a fixed redirect URI or dynamic. If dynamic, may not need changes.

## Scope

- Auth-code OAuth flows only (Anthropic, Gemini CLI, Antigravity)
- Device-code flows (GitHub Copilot) are unaffected
- API key entry is unaffected
- No client-side changes needed — the browser relay mechanism (`postMessage`/`BroadcastChannel`) stays the same

## Risks

- **Port conflict**: The registered callback port might be in use. Need graceful error handling.
- **Firewall**: Unlikely issue on localhost, but worth noting.
- **OpenAI Codex**: May need separate investigation if it also uses fixed redirect URIs.
