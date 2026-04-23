## Context

The dashboard lets users add custom LLM providers via Settings → Providers → LLM Providers. Each provider entry (`baseUrl`, `apiKey`, `api`) is stored in `~/.pi/agent/providers.json`. When the user saves, the server writes the file and broadcasts `credentials_updated` to all connected pi bridges.

Before this change, the bridge's `provider-register.ts` only read `providers.json` once at `activate()`. The `credentials_updated` handler called `modelRegistry.refresh()`, which re-reads `models.json` and re-applies *already-registered* providers — but a newly-added provider was never registered with `pi.registerProvider()`, so it remained invisible until the user restarted their session.

Additionally, there was no way for a user to verify whether their `baseUrl` + `apiKey` combination was correct before saving — they had to save, wait for session reload, open `/model`, and check if models appeared.

## Goals / Non-Goals

**Goals:**

- Adding, editing, or removing a custom provider in the dashboard takes effect immediately in every connected pi session without a restart
- Users can test a provider's connectivity (base URL reachable, API key valid) from the Settings UI before committing
- The apiKey is never exposed in test-endpoint responses

**Non-Goals:**

- Sharing the probe module between the server (`provider-probe.ts`) and the bridge (`discoverModels` in `provider-register.ts`) — this was considered but deferred because the bridge runs inside the pi extension runtime where importing server-side modules isn't straightforward. The two implementations diverge only in error handling (probe returns structured results, discover returns `[]`), so the duplication is minimal.
- Supporting non-`/models` discovery endpoints (e.g., Bedrock, Vertex) — these use SDK-level auth, not bearer/apikey, and are out of scope for the custom-provider card.
- Client-side polling or WebSocket push of test results — the test is a one-shot HTTP POST; no long-running state to sync.

## Decisions

### 1. Diff-and-apply via `lastRegistered` snapshot

**Choice:** Module-level `Map<string, ProviderEntry>` in `provider-register.ts`, populated after each successful `registerEntry()`. On reload, diff current file against snapshot; unregister removed/changed, then register new/changed.

**Rationale:** This is the simplest approach that avoids re-registering unchanged providers (which would trigger unnecessary async model discovery). `pi.unregisterProvider` is safe and idempotent — it restores built-in models if the name collides.

**Alternative considered:** Re-register every provider on every `credentials_updated`. Simpler code, but each registration triggers a network fetch (`/v1/models`) — wasteful when only one of many providers changed.

### 2. Lazy `configPath()` instead of top-level const

**Choice:** `configPath()` function that calls `homedir()` at invocation time, not at module load.

**Rationale:** Tests override `process.env.HOME` to an ephemeral tmpdir. A top-level const would capture the real `$HOME` at import time, breaking test isolation.

### 3. `reloadProviders` called *before* `modelRegistry.refresh()`

**Choice:** In the bridge's `credentials_updated` handler, `await reloadProviders(pi)` runs first, then `authStorage.reload()` and `modelRegistry.refresh()`.

**Rationale:** `refresh()` calls `loadModels()` which merges built-in models with custom models, then re-applies entries from `registeredProviders`. If we called `refresh()` first, the new provider wouldn't be in `registeredProviders` yet, so its models would be missing from `getAvailable()`.

### 4. Pure probe builders in `provider-probe.ts`

**Choice:** Split into three layers: pure `buildProbeRequest` (URL + headers), pure `resolveProbeApiKey` (literal / `$ENV` / REDACTED), and I/O-bearing `probeProvider`.

**Rationale:** The pure functions are trivially testable without fetch mocks. The I/O function has a small surface (one fetch call) that's easy to mock. This separation also makes it easy to add new API types later — just add a `case` to the switch in `buildProbeRequest`.

### 5. REDACTED sentinel resolution via injected `readProviders`

**Choice:** `resolveProbeApiKey` accepts a `readProviders: () => Record<string, ...>` function parameter (defaults to `readProvidersRaw` in the route). The test endpoint passes the route's existing `readProvidersRaw()` function.

**Rationale:** Avoids coupling the probe module to the file-system layout of `provider-routes.ts`. Tests inject a stub function that returns a fake providers map.

### 6. Inline status pill with field-edit clearing

**Choice:** `TestState` discriminated union (`idle | testing | ok | err`) as React local state in `LlmProviderCard`. Any change to `baseUrl`, `apiKey`, or `api` resets state to `idle`, hiding the pill.

**Rationale:** Stale results are confusing — if the user changes the URL, a green "Connected" pill from the old URL is misleading. Clearing on edit forces the user to re-test after changes.

**Alternative considered:** Auto-debounce re-test on edit. Rejected: would spam the upstream endpoint and cause flickering UI.

## Risks / Trade-offs

- **[Race condition on rapid saves]** If the user clicks Save twice quickly, two `credentials_updated` broadcasts fire. The second `reloadProviders` call may see the same file state as the first and produce an empty diff — harmless no-op. → **No mitigation needed; idempotent.**

- **[Async discovery timeout]** `registerEntry` calls `discoverModels` which fetches `/v1/models` with a 10s timeout. During this window, `reloadProviders` has already returned and the bridge has already sent `models_list` (with 0 models). Once discovery completes, `onProvidersChanged` fires and the bridge sends an updated list. → **User may briefly see 0 models for the new provider, then the list populates. Acceptable UX.**

- **[Test endpoint as credential oracle]** `POST /api/providers/test` is behind the network guard (localhost + auth), so only trusted callers can invoke it. The response never echoes the apiKey. The REDACTED sentinel only resolves for names already in providers.json, so it can't be used to probe arbitrary files. → **Low risk.**

- **[pi's ExtensionAPI type doesn't declare `unregisterProvider`]** The pi-coding-agent package's type declaration for `ExtensionAPI` didn't include `unregisterProvider`. We added it to the local `pi-env.d.ts` type augmentation. If pi removes or renames this method, TypeScript will catch the breakage at `reload:check` time. → **Forward-compatible with current pi releases.**
