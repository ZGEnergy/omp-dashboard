## ADDED Requirements

### Requirement: OAuth provider registry
The server SHALL maintain a registry of OAuth provider handlers. Each handler SHALL expose its provider ID, display name, flow type (`auth_code` or `device_code`), and methods for its specific OAuth flow. The registry SHALL include handlers for: `anthropic`, `openai-codex`, `github-copilot`, `google-gemini-cli`, and `google-antigravity`.

#### Scenario: List available OAuth providers
- **WHEN** a client requests `GET /api/provider-auth/providers`
- **THEN** the server SHALL return a JSON array of objects, each containing `id`, `name`, and `flowType` for every registered OAuth provider

### Requirement: Auth-code OAuth flow — authorize
For auth-code providers (Anthropic, OpenAI Codex, Gemini CLI, Antigravity), the server SHALL generate a PKCE code verifier and challenge, build the provider's authorization URL with the dashboard's callback redirect URI, and return the auth URL along with a flow ID. The server SHALL store the PKCE verifier and state server-side, keyed by flow ID.

#### Scenario: Start Anthropic OAuth
- **WHEN** a client requests `POST /api/provider-auth/authorize` with `{ provider: "anthropic" }`
- **THEN** the server SHALL return `{ flowId, authUrl }` where `authUrl` points to `claude.ai/oauth/authorize` with PKCE challenge, redirect URI, and scopes `org:create_api_key user:profile user:inference`

#### Scenario: Start OpenAI Codex OAuth
- **WHEN** a client requests `POST /api/provider-auth/authorize` with `{ provider: "openai-codex" }`
- **THEN** the server SHALL return `{ flowId, authUrl }` where `authUrl` points to `auth.openai.com/oauth/authorize` with PKCE challenge and scope `openid profile email offline_access`

#### Scenario: Start Gemini CLI OAuth
- **WHEN** a client requests `POST /api/provider-auth/authorize` with `{ provider: "google-gemini-cli" }`
- **THEN** the server SHALL return `{ flowId, authUrl }` where `authUrl` points to Google OAuth with scopes including `cloud-platform`, `userinfo.email`, `userinfo.profile`, and `access_type=offline`

#### Scenario: Start Antigravity OAuth
- **WHEN** a client requests `POST /api/provider-auth/authorize` with `{ provider: "google-antigravity" }`
- **THEN** the server SHALL return `{ flowId, authUrl }` where `authUrl` points to Google OAuth with additional scopes `cclog` and `experimentsandconfigs`

### Requirement: Auth-code OAuth flow — exchange
The server SHALL accept an authorization code and flow ID, look up the stored PKCE verifier, exchange the code with the provider's token endpoint, perform any provider-specific post-exchange steps (e.g., project discovery for Google providers, accountId extraction for Codex), map the tokens to pi's `auth.json` format, and persist them.

#### Scenario: Exchange Anthropic code for tokens
- **WHEN** a client requests `POST /api/provider-auth/exchange` with `{ flowId, code }`
- **THEN** the server SHALL POST to `platform.claude.com/v1/oauth/token` with JSON body including `grant_type`, `client_id`, `code`, `redirect_uri`, `code_verifier`, and persist the resulting `{ type: "oauth", refresh, access, expires }` to `auth.json` under key `anthropic`

#### Scenario: Exchange Codex code with accountId extraction
- **WHEN** a client requests `POST /api/provider-auth/exchange` with `{ flowId, code }` for `openai-codex`
- **THEN** the server SHALL exchange the code, decode the JWT access token to extract `accountId` from the `https://api.openai.com/auth` claim, and persist `{ type: "oauth", refresh, access, expires, accountId }` under key `openai-codex`

#### Scenario: Exchange Gemini CLI code with project discovery
- **WHEN** a client requests `POST /api/provider-auth/exchange` with `{ flowId, code }` for `google-gemini-cli`
- **THEN** the server SHALL exchange the code using `client_id` and `client_secret`, call `loadCodeAssist` to discover/provision a Cloud project, and persist `{ type: "oauth", refresh, access, expires, projectId }` under key `google-gemini-cli`

#### Scenario: Exchange fails gracefully
- **WHEN** the provider's token endpoint returns an error
- **THEN** the server SHALL return HTTP 400 with `{ error: "..." }` describing the failure

#### Scenario: Unknown flow ID
- **WHEN** a client submits an exchange request with an invalid or expired `flowId`
- **THEN** the server SHALL return HTTP 400 with `{ error: "Invalid or expired flow" }`

### Requirement: Device-code OAuth flow
For device-code providers (GitHub Copilot), the server SHALL request a device code from the provider, return the verification URL and user code to the client, then poll the provider's token endpoint on a server-side interval until authorization completes or times out.

#### Scenario: Start GitHub Copilot device flow
- **WHEN** a client requests `POST /api/provider-auth/device-code` with `{ provider: "github-copilot" }` and optional `{ enterpriseDomain }`
- **THEN** the server SHALL request a device code from GitHub, return `{ flowId, userCode, verificationUri, expiresIn, interval }`, and begin polling in the background

#### Scenario: Poll completes successfully
- **WHEN** the user authorizes the device code on GitHub
- **THEN** the server SHALL obtain the GitHub access token, exchange it for a Copilot token via `copilot_internal/v2/token`, persist credentials to `auth.json` under key `github-copilot`, and make the result available when the client polls `GET /api/provider-auth/device-status/:flowId`

#### Scenario: Poll timeout
- **WHEN** the device code expires without authorization
- **THEN** the server SHALL stop polling and report `{ status: "expired" }` on the next client status check

### Requirement: OAuth callback route
The server SHALL serve a callback route at `GET /api/provider-auth/callback/:provider` that receives the OAuth redirect. This route SHALL return an HTML page that extracts `code` and `state` from the URL query parameters and relays them to the opener window via `window.opener.postMessage()`, `BroadcastChannel("provider_oauth_callback")`, and `localStorage` as fallbacks.

#### Scenario: Successful callback relay
- **WHEN** the OAuth provider redirects to `/api/provider-auth/callback/anthropic?code=abc&state=xyz`
- **THEN** the server SHALL respond with an HTML page that sends `{ type: "provider_oauth_callback", data: { code: "abc", state: "xyz" } }` via postMessage to the opener and closes itself

#### Scenario: Error callback
- **WHEN** the OAuth provider redirects with `?error=access_denied`
- **THEN** the callback page SHALL relay the error to the opener via the same channels

### Requirement: Credential status API
The server SHALL expose `GET /api/provider-auth/status` returning the authentication status of all providers. For each provider it SHALL return: `id`, `name`, `flowType`, `authenticated` (boolean), and for OAuth providers the `expires` timestamp if authenticated. The server SHALL NOT return tokens or secrets.

#### Scenario: Mixed authenticated and unauthenticated providers
- **WHEN** `auth.json` contains credentials for `anthropic` and `openai` but not `github-copilot`
- **THEN** the status response SHALL show `authenticated: true` with `expires` for `anthropic`, `authenticated: true` for `openai` (API key, no expiry), and `authenticated: false` for `github-copilot`

### Requirement: API key CRUD
The server SHALL expose `PUT /api/provider-auth/api-key` accepting `{ provider, key }` to save an API key credential, and `DELETE /api/provider-auth/:provider` to remove any credential (OAuth or API key). Both SHALL write to `auth.json` atomically with file locking.

#### Scenario: Save API key
- **WHEN** a client sends `PUT /api/provider-auth/api-key` with `{ provider: "openai", key: "sk-..." }`
- **THEN** the server SHALL write `{ "openai": { "type": "api_key", "key": "sk-..." } }` to `auth.json` (merging with existing entries) and return `{ ok: true }`

#### Scenario: Remove credential
- **WHEN** a client sends `DELETE /api/provider-auth/anthropic`
- **THEN** the server SHALL remove the `anthropic` key from `auth.json` and return `{ ok: true }`

### Requirement: auth.json atomic write with locking
All writes to `auth.json` SHALL use a lockfile (`auth.json.lock`) with retry logic. If the file does not exist, it SHALL be created with `0600` permissions. Existing file permissions SHALL be preserved on update.

#### Scenario: Concurrent write protection
- **WHEN** two write operations occur simultaneously
- **THEN** one SHALL acquire the lock and complete; the other SHALL retry after a delay and then complete without data loss

#### Scenario: New file creation
- **WHEN** `auth.json` does not exist and a credential is saved
- **THEN** the file SHALL be created with mode `0600` (owner read/write only)

### Requirement: Bridge notification on credential change
After any credential write (OAuth save, API key save, or credential removal), the server SHALL broadcast a `credentials_updated` message to all connected pi sessions via the pi WebSocket gateway.

#### Scenario: OAuth login triggers bridge notification
- **WHEN** a user completes OAuth login for Anthropic
- **THEN** the server SHALL send `{ type: "credentials_updated" }` to all connected bridge extensions via the pi gateway
