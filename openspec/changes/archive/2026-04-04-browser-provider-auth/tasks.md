## 1. Shared Types & Protocol

- [x] 1.1 Add `CredentialsUpdatedMessage` type to `src/shared/protocol.ts` (`{ type: "credentials_updated" }`) and add it to the `ServerToExtensionMessage` union
- [x] 1.2 Add provider auth types to `src/shared/rest-api.ts`: `ProviderAuthInfo` (id, name, flowType), `ProviderAuthStatus` (id, name, flowType, authenticated, expires?), `AuthorizeResponse` (flowId, authUrl), `DeviceCodeResponse` (flowId, userCode, verificationUri, expiresIn, interval)

## 2. Server — Auth.json File Operations

- [x] 2.1 Create `src/server/provider-auth-storage.ts`: read/write `~/.pi/agent/auth.json` with lockfile (`auth.json.lock`), retry logic, `0600` permissions on creation, atomic write. Export `readAuthJson()`, `writeCredential(provider, credential)`, `removeCredential(provider)`, `getAuthStatus()`

## 3. Server — OAuth Provider Handlers

- [x] 3.1 Create `src/server/provider-auth-handlers.ts` with a `ProviderOAuthHandler` interface and registry. Implement Anthropic handler: PKCE generation, auth URL builder (claude.ai/oauth/authorize), JSON token exchange (platform.claude.com/v1/oauth/token), credential mapper
- [x] 3.2 Add OpenAI Codex handler: PKCE, auth URL (auth.openai.com), form-urlencoded exchange, JWT decode to extract `accountId`
- [x] 3.3 Add GitHub Copilot handler (device code flow): request device code from `github.com/login/device/code`, poll for access token, exchange for Copilot token via `copilot_internal/v2/token`, support enterprise domain
- [x] 3.4 Add Gemini CLI handler: PKCE, Google OAuth URL, exchange with `client_secret`, `loadCodeAssist` project discovery/provisioning
- [x] 3.5 Add Antigravity handler: PKCE, Google OAuth URL (different client ID/secret/scopes from Gemini), exchange, project discovery

## 4. Server — Routes

- [x] 4.1 Create `src/server/routes/provider-auth-routes.ts` with routes: `GET /api/provider-auth/providers`, `GET /api/provider-auth/status`, `POST /api/provider-auth/authorize`, `POST /api/provider-auth/exchange`, `GET /api/provider-auth/callback/:provider` (HTML callback page), `POST /api/provider-auth/device-code`, `GET /api/provider-auth/device-status/:flowId`, `PUT /api/provider-auth/api-key`, `DELETE /api/provider-auth/:provider`
- [x] 4.2 Register provider-auth routes in `src/server/server.ts`
- [x] 4.3 Implement the callback HTML page: extract `code`/`state`/`error` from URL, relay via `postMessage` + `BroadcastChannel("provider_oauth_callback")` + `localStorage`, auto-close

## 5. Server — Bridge Notification

- [x] 5.1 After every credential write/delete in the routes, broadcast `{ type: "credentials_updated" }` to all connected pi sessions via the pi gateway

## 6. Bridge Extension

- [x] 6.1 Handle `credentials_updated` message in the bridge: when received and `cachedModelRegistry?.authStorage` is available, call `authStorage.reload()`

## 7. Client — Provider Auth UI

- [x] 7.1 Create `src/client/components/ProviderAuthSection.tsx`: fetches status from `/api/provider-auth/status`, renders OAuth provider cards with sign-in/sign-out buttons and API key provider rows with masked input fields
- [x] 7.2 Implement auth-code popup flow: call `/authorize`, open popup, listen for code via `postMessage`/`BroadcastChannel`/`localStorage`, call `/exchange`, refresh status. Include popup-blocked fallback (copyable URL + manual paste input)
- [x] 7.3 Implement device-code flow modal: call `/device-code`, show user code + verification URL, poll `/device-status/:flowId`, handle success/expiry
- [x] 7.4 Implement API key save/remove: `PUT /api/provider-auth/api-key`, `DELETE /api/provider-auth/:provider`, refresh status
- [x] 7.5 Integrate `ProviderAuthSection` into `SettingsPanel.tsx` as the first section ("Provider Authentication")

## 8. Testing

- [x] 8.1 Unit tests for `provider-auth-storage.ts`: read, write, remove, concurrent lock, file creation with permissions
- [x] 8.2 Unit tests for `provider-auth-handlers.ts`: auth URL generation, credential mapping (mock fetch for token exchange)
- [x] 8.3 Unit tests for provider-auth routes: authorize, exchange, device-code, api-key CRUD, callback HTML content
- [x] 8.4 Unit test for bridge `credentials_updated` handler

## 9. Documentation

- [x] 9.1 Update AGENTS.md key files table with new files
- [x] 9.2 Update docs/architecture.md with provider auth flow description
- [x] 9.3 Update README.md with provider authentication section
