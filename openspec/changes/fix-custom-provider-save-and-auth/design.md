## Context

Dashboard custom providers ("proxies") are configured in `~/.pi/agent/providers.json` and registered into each pi session via `pi.registerProvider(name, config)` in `packages/extension/src/provider-register.ts::registerEntry`. The dashboard targets pi / pi-ai **0.80.2**.

pi-ai 0.80.x changed two things the dashboard's code predates:

1. **Config-value resolution (pi #5661, #5095).** A plain-string `apiKey` is now a **literal**; environment references require explicit `$ENV_VAR` / `${ENV_VAR}` syntax. Verified in `node_modules/@earendil-works/pi-coding-agent/dist/core/resolve-config-value.js`: `getConfigValueEnvVarNames("FOO")` returns `[]` for a bare name, so `resolveConfigValueOrThrow` yields the literal `"FOO"`.
2. **Provider auth status split.** `modelRegistry.getProviderAuthStatus(provider)` reports configured-ness including keys supplied via `registerProvider` (held in `providerRequestConfigs`); `authStorage.getAuthStatus(provider)` only knows `auth.json`. Verified in `dist/core/model-registry.js`.

Current dashboard behavior that breaks against this:

- `resolveApiKeyEnvName(name, apiKey)` stuffs the literal key into `process.env.JUDO_<NAME>_KEY` and returns the **bare** name (no `$`). Under 0.80.x that bare name is a literal → upstream receives the string `JUDO_<NAME>_KEY`, never the real key.
- `_buildProviderCatalogue` derives `configured`/`source` from `authStorage.getAuthStatus(id)` → custom providers (key only in `providerRequestConfigs`) report `configured:false` → UI shows "no API key setup".
- `SettingsPanel` save filters `p.name.trim() !== ""` → blank-name rows silently dropped.
- `PUT /api/providers` merge writes literal `***` as apiKey when `entry.apiKey === "***"` but the provider is absent from the existing file.

## Goals / Non-Goals

**Goals:**
- A saved custom provider's real key reaches the upstream under pi-ai 0.80.x.
- A saved custom provider reports `configured: true` and stops showing "no API key setup".
- Blank-name provider rows fail save loudly instead of vanishing.
- The masked `***` sentinel is never persisted as a real key.

**Non-Goals:**
- Mid-session model-switch silent no-op in `bridge.setModel` (separate change).
- Reworking the model-discovery (`/v1/models`) probe or its api-type metadata enrichment.
- Migrating off the pi-ai `compat` entrypoint or to `createModels()`.

## Decisions

**D1 — apiKey resolution: prefer the explicit `$`-reference, keep the env stash.**
Change `resolveApiKeyEnvName` so the value handed to `registerProvider` is pi-0.80.x-resolvable: return `"$JUDO_<NAME>_KEY"` (with `$`) while still setting `process.env.JUDO_<NAME>_KEY = key`, and for user `$ENV` input return the `$`-reference unchanged.
- *Why over passing the literal key directly?* The synthetic-env indirection keeps the secret out of pi's in-memory `providerRequestConfigs` as a literal and reuses the existing env stash; a one-character fix (restore the `$`) aligns with the new interpolation contract. Passing the literal is a valid fallback but changes where the secret lives.
- *Alternative considered:* write the key into `auth.json` as `{type:"api_key"}` per pi #5953. Rejected for scope — custom providers are deliberately managed outside `auth.json` (the `custom:true` suppression contract).

**D2 — catalogue `configured`/`source` from the registry-level status.**
`_buildProviderCatalogue` reads `modelRegistry.getProviderAuthStatus(id)` first, falling back to `authStorage.getAuthStatus(id)`/`authStorage.has(id)` when the method is absent (older pi). Spec field list updated to include the registry-level `source` values (`models_json_key`, `models_json_command`).
- *Why fallback?* Keeps the bridge resilient across pi versions; `getProviderAuthStatus` is 0.80.x-era.

**D3 — blank-name save guard is client-side.**
`SettingsPanel`'s LLM-providers save task validates names before building the PUT body; on a blank name it throws (the existing per-task `Promise.allSettled` failure path keeps the source dirty and surfaces the error). No server change needed for this defect.

**D4 — `***`-without-existing guard is server-side.**
`PUT /api/providers` merge rejects (400) or drops the key when `apiKey === "***"` and `existing[name]` is absent, so the sentinel can never become the stored key.

## Risks / Trade-offs

- [Restoring `$` breaks if a user literally wants a key starting with `$`] → user `$`-input is already treated as an env reference today; behavior for literal-`$` keys is unchanged (still ambiguous, pre-existing).
- [`getProviderAuthStatus` missing on a future/older pi] → fallback to `authStorage` preserves current behavior; no crash.
- [400 on `***`-without-existing could surface during a legit rename flow] → rename of existing providers is not supported in the UI (name field is read-only for saved providers), so the only path to `***`-without-existing is a prior corruption/out-of-band edit, which we want to block.

## Migration Plan

- Pure bug-fix; no data migration. Existing `providers.json` entries already corrupted to `apiKey: "***"` must be re-entered by the user (documented in the task validation message). Deploy via standard extension reload (`npm run reload`) + client rebuild.
- Rollback: revert the change; prior (broken-under-0.80.x) behavior returns.

## Open Questions

- None blocking. If product wants corrupted `***` keys auto-detected and surfaced in the UI, that is a follow-up.
