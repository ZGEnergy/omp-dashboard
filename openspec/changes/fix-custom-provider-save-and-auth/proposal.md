## Why

Saving a custom LLM provider ("proxy") in dashboard Settings no longer works against pi / pi-ai 0.80.x. The bridge registers the provider with a **bare synthetic env-var name** as its `apiKey`, but pi-ai 0.80.x changed config-value resolution to treat plain strings as **literals** (pi #5661, #5095) — so the literal string `JUDO_<NAME>_KEY` is sent upstream instead of the real key. Separately the dashboard reads `authStorage.getAuthStatus(id)` for the provider catalogue, which is blind to `registerProvider`-supplied keys (those live in `providerRequestConfigs`, surfaced only by the new `modelRegistry.getProviderAuthStatus(id)`), so a saved custom provider reports **"no API key setup."** Two save-path defects compound the confusion: a provider whose name is empty/whitespace is silently dropped, and a masked `***` key re-saved while the provider is absent from `providers.json` is persisted as the literal string `***`, corrupting the key.

## What Changes

- Bridge `resolveApiKeyEnvName` (`provider-register.ts`) emits an explicit `$JUDO_<NAME>_KEY` reference (with `$`) — or passes the literal key through — so pi-ai 0.80.x resolves the real key from `process.env` instead of treating a bare name as a literal. `$`-prefixed user input keeps its `$` reference intact.
- Provider-catalogue `configured`/`source` derivation (`_buildProviderCatalogue`) reads `modelRegistry.getProviderAuthStatus(id)` (registry-level, sees `registerProvider` keys) with `authStorage.getAuthStatus(id)` only as a fallback, so saved custom providers stop reporting "no API key setup."
- Settings save (`SettingsPanel` LLM-providers task) surfaces an error instead of silently dropping a provider with an empty/whitespace name.
- Server `PUT /api/providers` merge no longer writes the literal `***` sentinel as an apiKey when the named provider is absent from the existing file (reject or treat as missing key rather than corrupting).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `provider-auth-bridge`: custom-provider `apiKey` registration SHALL produce a key pi-ai 0.80.x resolves to the real secret; provider-catalogue `configured`/`source` SHALL derive from the registry-level provider auth status so `registerProvider`-supplied keys count as configured.
- `settings-panel`: saving LLM providers SHALL reject empty/whitespace provider names with a visible error instead of silently dropping them, and SHALL never persist the masked `***` sentinel as a real apiKey.

## Impact

- `packages/extension/src/provider-register.ts` — `resolveApiKeyEnvName`, `registerEntry`, `_buildProviderCatalogue`.
- `packages/server/src/routes/provider-routes.ts` — `PUT /api/providers` merge (`***`-without-existing guard).
- `packages/client/src/components/SettingsPanel.tsx` — LLM-providers save task validation.
- Runtime contract with `@earendil-works/pi-coding-agent` / `pi-ai` 0.80.x (config-value literal-vs-`$ENV` semantics; `getProviderAuthStatus`).
- Out of scope: mid-session model-switch silent no-op in `bridge.setModel` (tracked separately).
