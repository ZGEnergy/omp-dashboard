## 1. Auth-code handler metadata

- [x] 1.1 Add `callbackPort` and `callbackPath` fields to the `AuthCodeHandler` interface in `provider-auth-handlers.ts`
- [x] 1.2 Set callback metadata on all four auth-code handlers: Anthropic (53692, `/callback`), Codex (1455, `/auth/callback`), Gemini CLI (8085, `/oauth2callback`), Antigravity (51121, `/oauth-callback`)

## 2. Temporary callback server

- [x] 2.1 Create `packages/server/src/oauth-callback-server.ts` — `startCallbackServer(opts)` that starts a temp HTTP server on the registered port, receives the code, calls an `onCode` callback, serves result HTML, and auto-closes on timeout
- [x] 2.2 Track active servers per provider, close existing before starting new, auto-close after 5 min timeout
- [x] 2.3 Write tests for callback server (successful callback, timeout, port-in-use error, concurrent flow cleanup)

## 3. Route integration

- [x] 3.1 Update `/api/provider-auth/authorize` to construct `redirectUri` from `handler.callbackPort`/`callbackPath`, start the temp callback server, and open the system browser
- [x] 3.2 In the callback server's `onCode`, exchange the code for tokens and save credentials (move exchange logic from `/exchange` endpoint)
- [x] 3.3 Notify browser WebSocket clients on auth completion so UI refreshes (using polling instead — simpler, no protocol changes)
- [x] 3.4 Remove the `callbackHtml` popup relay and the `/api/provider-auth/callback/:provider` route
- [x] 3.5 Update client `ProviderAuthSection` to remove popup window logic, poll or listen for auth completion instead
- [x] 3.6 Update route tests

## 4. Verification

- [x] 4.1 Test OAuth login end-to-end from the Electron app (manual)
