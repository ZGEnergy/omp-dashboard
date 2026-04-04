## Why

Pi sessions require provider credentials (OAuth tokens or API keys) to call LLMs. Currently, OAuth login (`/login`) only works from a terminal with a local browser — impossible when managing sessions remotely via the dashboard (phone, tablet, tunnel). Users must SSH in or physically access the machine to authenticate. This blocks the dashboard's promise of fully remote session management.

## What Changes

- **Browser-based OAuth login for all 5 pi subscription providers**: Anthropic (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), GitHub Copilot, Google Gemini CLI, and Google Antigravity. The dashboard server handles PKCE generation and token exchange; the browser opens a popup for the provider's consent screen.
- **API key entry for non-OAuth providers**: Text input in Settings for providers that use API keys (Anthropic API, OpenAI, Mistral, Groq, etc.), saved to `~/.pi/agent/auth.json`.
- **Provider auth status display**: Settings shows which providers are authenticated, token expiry, and login/logout controls.
- **Credential persistence via `auth.json`**: Server writes credentials in pi's native format so all pi sessions (current and future) can use them.
- **Live session notification**: Connected pi sessions are notified when credentials change so they reload `auth.json` immediately without restart.
- **OAuth callback page**: A `/provider-callback` route on the dashboard that relays the authorization code back to the Settings popup via `postMessage`/`BroadcastChannel`.

## Capabilities

### New Capabilities
- `provider-auth-server`: Server-side OAuth flow orchestration (PKCE generation, token exchange proxy, auth.json writer, credential status API) and API key CRUD for all pi providers
- `provider-auth-ui`: Settings page section for provider authentication — OAuth login buttons, API key fields, status indicators, logout
- `provider-auth-bridge`: Bridge protocol extension to notify running pi sessions when credentials change (triggers `authStorage.reload()`)

### Modified Capabilities
- `settings-panel`: Add provider authentication section to the existing settings UI

## Impact

- **New server routes**: `/api/provider-auth/*` (authorize, exchange, callback, status, api-key, logout)
- **New client page**: `/provider-callback` (lightweight HTML that relays OAuth codes)
- **New client component**: Provider auth section in SettingsPanel
- **Protocol addition**: New `credentials_updated` server→bridge message type
- **Bridge extension change**: Handle `credentials_updated` by calling `authStorage.reload()`
- **Dependencies**: None new — uses existing `node:crypto` for PKCE, `node:fs` for auth.json
- **Security**: PKCE verifier stays server-side; token exchange happens server-to-provider (never browser-to-provider); auth.json written with 0600 permissions
- **Provider-specific details**:
  - Anthropic: Auth code + PKCE, fixed redirect to `localhost:53692`, JSON token exchange
  - OpenAI Codex: Auth code + PKCE, fixed redirect to `localhost:1455`, form-urlencoded exchange, extracts `accountId` from JWT
  - GitHub Copilot: Device code flow (no redirect needed — shows user code + verification URL, polls for token)
  - Gemini CLI: Auth code + PKCE via Google OAuth, requires `client_secret`, discovers/provisions Cloud project post-login
  - Antigravity: Auth code + PKCE via Google OAuth, different client credentials than Gemini CLI, discovers Cloud project post-login
