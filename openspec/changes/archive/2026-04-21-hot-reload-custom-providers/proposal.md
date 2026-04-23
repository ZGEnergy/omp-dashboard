## Why

When a user adds, edits, or removes a custom LLM provider through the dashboard Settings UI, the new provider's models do not appear in the model selector until the pi session is fully reloaded/restarted. The root cause: `packages/extension/src/provider-register.ts` only reads `~/.pi/agent/providers.json` **once** at `activate()`. The dashboard's `PUT /api/providers` → `credentials_updated` broadcast chain does trigger `ModelRegistry.refresh()` in the bridge, but `refresh()` only re-reads `models.json` and re-applies the already-registered providers in `registeredProviders`. A provider newly written to `providers.json` was never registered via `pi.registerProvider()`, so `refresh()` never picks it up.

This is the "last mile" complement to the already-landed `fix-model-selector-after-provider-auth` change, which ensured browser clients clear their cached model lists on `credentials_updated` — that fix only helps when the bridge already knows about the provider. For providers.json-sourced providers, the bridge itself is stale.

## What Changes

### A. Bridge-side hot-reload (invisible to user)

- Add a module-level `reloadProviders(pi)` function to `packages/extension/src/provider-register.ts` that diffs `providers.json` against a `lastRegistered: Map<string, ProviderEntry>` snapshot and calls `pi.unregisterProvider(...)` / `registerEntry(...)` as needed. Async discovery inside `registerEntry` already fires `onProvidersChanged` → bridge re-sends `models_list`, so no new protocol message is required.
- In `packages/extension/src/bridge.ts` `credentials_updated` handler, invoke `reloadProviders(pi)` **before** `cachedModelRegistry.refresh()` so the new providers are registered before the refresh pulls them into `this.models`.
- Do not introduce a new message type: the existing `credentials_updated` signal is already broadcast by `PUT /api/providers` in `provider-routes.ts`, so extending its bridge-side handler is sufficient.

### B. "Test Connection" button on the Add Provider card (user-facing)

- Add a new server endpoint `POST /api/providers/test` (localhost-guarded) that accepts `{ baseUrl, apiKey, api }` (api key may be a literal, a `$ENV_VAR` reference, or the `***` REDACTED sentinel — in the REDACTED case the server reads the live value from `~/.pi/agent/providers.json` for the given provider name). It performs a per-API-type probe with a short timeout (default 8s) and returns `{ ok: boolean, status?: number, modelCount?: number, error?: string, sample?: string[] }`.
  - `openai-completions` / `openai-responses`: `GET {baseUrl}/models` with `Authorization: Bearer <apiKey>` (reuses the same call `provider-register.ts` already makes for discovery).
  - `anthropic-messages`: `GET {baseUrl}/v1/models` with `x-api-key: <apiKey>` and `anthropic-version: 2023-06-01`.
  - `google-generative-ai`: `GET {baseUrl}/models?key=<apiKey>`.
  - Non-2xx HTTP status → `{ ok: false, status, error: <body excerpt> }`. Network/timeout errors → `{ ok: false, error: "…" }`.
- In `packages/client/src/components/SettingsPanel.tsx` → `LlmProviderCard`, add a **Test** button next to Remove. On click: POST the card's current `{ baseUrl, apiKey, api }` (without first saving), show an inline status pill (`Testing…` spinner → `✓ Connected · 27 models` green, or `✗ 401 Invalid API key` red) beneath the form fields. Button is disabled while baseUrl/apiKey are empty.
- Extract the probe logic into a pure helper module (`packages/server/src/provider-probe.ts`) so the bridge's existing `discoverModels()` in `provider-register.ts` can share the same per-API-type request builders (DRY).

### C. Tests

- Bridge reload: (a) adding an entry to providers.json + firing `credentials_updated` causes `modelRegistry.getAvailable()` to include the new provider's models without a session restart, (b) removing an entry calls `unregisterProvider`, (c) changing `baseUrl`/`apiKey` re-registers with new config.
- Provider probe: per-API-type request shape (headers, URL construction), 2xx vs 4xx vs network-error mapping, REDACTED apiKey resolution against existing providers.json entry, `$ENV_VAR` resolution.
- Client: Test button dispatches POST with correct payload, shows spinner/success/error states, is disabled with empty inputs.

## Capabilities

### New Capabilities

- `provider-connection-test`: server + client capability for verifying a custom LLM provider's `baseUrl` + `apiKey` + `api` combination from the Settings UI before saving, via a new `POST /api/providers/test` REST endpoint and a **Test** button on the Add Provider card.

### Modified Capabilities

- `provider-auth-bridge`: extend the `credentials_updated` bridge handler requirement to include hot-reload of providers.json entries (register/unregister/replace) before the model registry refresh.

## Impact

- **Code**:
  - `packages/extension/src/provider-register.ts` (+ ~40 lines — `reloadProviders` and `lastRegistered` tracking) — *bridge reload*
  - `packages/extension/src/bridge.ts` (+ 2 lines — call `reloadProviders` before `refresh`) — *bridge reload*
  - `packages/server/src/provider-probe.ts` (new, ~80 lines) — *test endpoint* (pure per-API probe builders)
  - `packages/server/src/routes/provider-routes.ts` (+ ~30 lines — new `POST /api/providers/test` route, REDACTED-apikey resolution, 8s timeout)
  - `packages/client/src/components/SettingsPanel.tsx` → `LlmProviderCard` (+ ~40 lines — Test button, status pill, `/api/providers/test` fetch helper in `packages/client/src/lib/providers-api.ts`)
  - Three new vitest files: bridge reload, server probe, client card test flow.
- **Protocol**: No new WebSocket message types. One new REST endpoint (`POST /api/providers/test`).
- **Persistence**: None. Test requests are ephemeral; no file changes occur unless the user subsequently clicks Save.
- **Migration**: None. Older bridges still behave as before on providers.json edits until restarted; the Test button is purely additive.
- **Risk**: Low. The bridge change is additive (extra call before existing refresh). The probe endpoint is localhost-guarded and has a hard timeout; failing probes return `{ ok: false }` without side effects. `pi.unregisterProvider` is reversible. Failure modes are logged (`console.error` with `[dashboard]` prefix) to match the logging style introduced in `fix-model-selector-after-provider-auth`.
