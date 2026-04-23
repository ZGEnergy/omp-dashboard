## 1. Provider-register hot-reload

- [x] 1.1 Add module-level `lastRegistered: Map<string, ProviderEntry>` snapshot to `packages/extension/src/provider-register.ts`; populate it inside `registerEntry` after a successful `pi.registerProvider` call
- [x] 1.2 Export `reloadProviders(pi: ExtensionAPI): Promise<{ added: string[]; removed: string[]; changed: string[] }>` that (a) reads the current `providers.json`, (b) diffs against `lastRegistered`, (c) calls `pi.unregisterProvider` for removed + changed entries, (d) calls `registerEntry` for added + changed entries, (e) returns the diff summary for logging
- [x] 1.3 Treat a provider as "changed" when any of `baseUrl`, `apiKey`, `api` differs from the snapshot
- [x] 1.4 Wrap the providers.json read in try/catch; on failure log `[dashboard] providers.json reload failed: ...` and return an empty diff so the caller still runs `modelRegistry.refresh()`

## 2. Bridge wiring

- [x] 2.1 In `packages/extension/src/bridge.ts` `credentials_updated` handler, `await reloadProviders(pi)` before `cachedModelRegistry?.refresh?.()`
- [x] 2.2 When `reloadProviders` returns a non-empty diff, log `[dashboard] hot-reloaded providers: added=[...] removed=[...] changed=[...]` via `console.log` so operators can see the update in `~/.pi/dashboard/server.log`
- [x] 2.3 Keep the existing `onProviderChanged` callback path intact — async discovery inside `registerEntry` already triggers the `models_list` push; no new wiring needed

## 3. Bridge reload tests

- [x] 3.1 Add `packages/extension/src/__tests__/provider-register-reload.test.ts` with a mocked `ExtensionAPI` that records `registerProvider` / `unregisterProvider` calls
- [x] 3.2 Scenario: starting from empty snapshot, adding a provider to providers.json and calling `reloadProviders` results in exactly one `registerProvider` call and zero `unregisterProvider` calls
- [x] 3.3 Scenario: removing a provider from providers.json calls `unregisterProvider` exactly once for that name
- [x] 3.4 Scenario: changing `baseUrl` on an existing entry calls `unregisterProvider` then `registerProvider` in that order
- [x] 3.5 Scenario: unchanged providers.json produces no registry calls
- [x] 3.6 Scenario: malformed providers.json returns an empty diff and does not throw
- [x] 3.7 Use `vi.mock`ed `fetch` to stub `/v1/models` discovery so tests remain deterministic and offline

## 4. Provider probe (server)

- [x] 4.1 Create `packages/server/src/provider-probe.ts` exporting a pure `buildProbeRequest({ baseUrl, apiKey, api })` helper that returns `{ url, headers }` per API type (openai-completions, openai-responses, anthropic-messages, google-generative-ai) — no I/O; testable in isolation
- [x] 4.2 Export `probeProvider({ baseUrl, apiKey, api, timeoutMs = 8000 })` in the same file: calls `buildProbeRequest`, issues the fetch with an `AbortController` timeout, parses response, returns `{ ok, status?, modelCount?, sample?, error? }`. Sample is limited to first 5 ids. Never echoes `apiKey` in the returned error string.
- [x] 4.3 Add key-resolution helper `resolveProbeApiKey({ apiKey, name, readProviders })`: handles `$ENV_VAR` (reads `process.env`), `***` REDACTED sentinel (reads live value via injected `readProviders()` — defaults to `readProvidersRaw` from provider-routes but injectable for tests), and literal passthrough. Returns `{ ok: true, key } | { ok: false, error }`.
- [x] 4.4 Register `POST /api/providers/test` in `packages/server/src/routes/provider-routes.ts` behind `networkGuard`. Validates body shape, calls `resolveProbeApiKey` then `probeProvider`, returns JSON. Returns HTTP 400 on malformed body.
- [x] 4.5 Add `packages/server/src/__tests__/provider-probe.test.ts` covering: all 4 API types produce the correct URL + headers; 2xx → ok with modelCount + sample (capped at 5); 401 → `{ ok: false, status: 401, ... }`; 500 → `{ ok: false, status: 500 }`; network error → `{ ok: false, error }` with no status; timeout fires abort and returns error; `$ENV_VAR` resolution happy path + missing env var; REDACTED sentinel resolves via injected reader; REDACTED with missing name returns error; response never contains the raw apiKey.

## 5. Client Test button

- [x] 5.1 Add `packages/client/src/lib/providers-api.ts` with `testProvider({ name?, baseUrl, apiKey, api }): Promise<{ ok, status?, modelCount?, sample?, error? }>` (thin wrapper around `fetch("/api/providers/test")`)
- [x] 5.2 Extend `LlmProviderCard` in `packages/client/src/components/SettingsPanel.tsx`:
  - Local state: `testState: "idle" | "testing" | { type: "ok", modelCount?, sample? } | { type: "err", status?, message }`
  - Test button next to Remove (blue accent, disabled when baseUrl/apiKey empty or testState is "testing")
  - On click: set `testing`, call `testProvider`, set `ok` / `err`
  - Inline status pill below form fields renders per state
  - Any change to `baseUrl` / `apiKey` / `api` resets `testState` to `idle` (clears stale pill)
- [x] 5.3 Add `packages/client/src/components/__tests__/LlmProviderCard.test.tsx` covering: button disabled with empty fields; click dispatches POST with correct payload; spinner state; success pill renders count; error pill renders status + message; editing field clears pill; REDACTED apiKey path sends name + `***`.

## 6. Documentation

- [x] 6.1 Update `docs/architecture.md`: in the credentials/reload section, note that `credentials_updated` now hot-reloads `providers.json` in addition to triggering `authStorage.reload()` and `modelRegistry.refresh()`. Add a short subsection on `POST /api/providers/test` with the request/response shape.
- [x] 6.2 Update `AGENTS.md`:
  - Entry for `src/extension/provider-register.ts` — mention exported `reloadProviders` + `lastRegistered` snapshot
  - New entry for `src/server/provider-probe.ts` — per-API probe builders + `probeProvider`
  - Entry for `src/server/routes/provider-routes.ts` — mention new `POST /api/providers/test`
  - New entry for `src/client/lib/providers-api.ts` — `testProvider` wrapper
- [x] 6.3 Update `README.md` Settings section: adding/removing/editing custom providers takes effect live (no session restart); **Test** button lets you verify credentials before saving.

## 7. Manual QA

- [x] 7.1 Start dashboard + one pi session. Open `/model`. Note current model count.
- [x] 7.2 Settings → Providers → Add Provider. Enter a valid OpenAI-compatible baseUrl + apiKey. Click **Test** — green pill `✓ Connected · N models` appears.
- [x] 7.3 Change the apiKey to garbage. Click Test — red pill `✗ 401 — ...` appears.
- [x] 7.4 Change apiKey to `$NONEXISTENT_ENV_VAR`. Click Test — red pill `Environment variable NONEXISTENT_ENV_VAR is not set`.
- [x] 7.5 Fix the key, Save. Without reloading the session, open `/model` — new provider's models appear. Verify `[dashboard] hot-reloaded providers: added=[...]` in `~/.pi/dashboard/server.log`.
- [x] 7.6 Edit an existing provider's apiKey field (shows `***`). Click Test — server resolves real key from providers.json and probe succeeds.
- [x] 7.7 Remove the provider. Save. Verify models disappear and `removed=[...]` log line fires.
- [x] 7.8 Edit a provider's `baseUrl`. Save. Verify `changed=[...]` log line and new `baseUrl` is used.

## 8. Build & restart

- [x] 8.1 `npm test` — all tests pass, including the three new vitest files
- [x] 8.2 `npm run build` (client changes require production bundle)
- [x] 8.3 `curl -X POST http://localhost:8000/api/restart` (server has new route + probe module)
- [x] 8.4 `npm run reload:check` — type-check and reload all connected pi sessions so the new bridge takes effect
