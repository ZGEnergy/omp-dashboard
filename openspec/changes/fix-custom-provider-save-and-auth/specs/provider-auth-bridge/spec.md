## ADDED Requirements

### Requirement: Custom-provider apiKey resolves to the real secret under pi-ai 0.80.x

When the bridge registers a custom provider via `pi.registerProvider(...)` in `registerEntry()` (`packages/extension/src/provider-register.ts`), the `apiKey` value passed in `ProviderConfigInput` SHALL be a string that pi-ai 0.80.x resolves to the user's actual secret — NOT a bare environment-variable name. pi-ai 0.80.x (pi #5661, #5095) treats a plain string `apiKey` as a **literal** and resolves environment references only via explicit `$ENV_VAR` / `${ENV_VAR}` syntax. Therefore `resolveApiKeyEnvName` SHALL emit either:

- the literal key string verbatim (so pi sends the real secret as a literal), OR
- an explicit `$`-prefixed reference (e.g. `$JUDO_<NAME>_KEY`) whose target env var the bridge has populated in `process.env`, so pi-ai interpolates the real secret at request time.

A bare, non-`$`-prefixed synthetic env-var name SHALL NOT be passed as `apiKey`. User-supplied `$ENV_VAR` input SHALL retain its `$` prefix when forwarded to `registerProvider`.

#### Scenario: Literal key entered in Settings reaches upstream verbatim
- **WHEN** `~/.pi/agent/providers.json` contains a `proxy` entry with `apiKey: "sk-real-123"`
- **AND** the bridge registers `proxy` via `registerEntry`
- **THEN** the value pi-ai resolves for the `proxy` provider's API key SHALL equal `"sk-real-123"`
- **AND** the outbound request SHALL send `Authorization: Bearer sk-real-123`, never the literal string of a synthetic env-var name

#### Scenario: $ENV reference entered in Settings is resolved from the environment
- **WHEN** the `proxy` entry has `apiKey: "$PROXY_KEY"` and `process.env.PROXY_KEY === "sk-env-456"`
- **THEN** the value passed to `registerProvider` SHALL retain an explicit `$`-prefixed reference resolvable by pi-ai
- **AND** pi-ai SHALL resolve the `proxy` API key to `"sk-env-456"`

## MODIFIED Requirements

### Requirement: Provider catalogue payload shape
Each entry in the `providers` array of `providers_list` SHALL be an object with the following fields, derived from pi's live `ModelRegistry` and the bridge's own custom-provider tracking:

- `id` (string, required): pi-ai provider id (e.g. `"anthropic"`, `"deepseek"`, `"google-vertex"`).
- `displayName` (string, required): from `modelRegistry.getProviderDisplayName(id)`.
- `hasOAuth` (boolean, required): `true` iff `authStorage.getOAuthProviders().some(p => p.id === id)`.
- `configured` (boolean, required): derived from the **registry-level** `modelRegistry.getProviderAuthStatus(id).configured`. This SHALL account for keys supplied via `pi.registerProvider(...)` (stored in pi's `providerRequestConfigs`), not only `auth.json` credentials. When `getProviderAuthStatus` is unavailable on the registry, the bridge MAY fall back to `authStorage.has(id)`.
- `source` (`"stored" | "environment" | "fallback" | "runtime" | "models_json_key" | "models_json_command" | undefined`, optional): from `modelRegistry.getProviderAuthStatus(id).source`, falling back to `authStorage.getAuthStatus(id).source` when the registry-level status is unavailable.
- `envVar` (string, optional): the first env var name returned by pi-ai's `findEnvKeys(id)`.
- `ambient` (boolean, optional): `true` when `pi-ai.getEnvApiKey(id) === "<authenticated>"` (Vertex ADC / Bedrock IAM).
- `expires` (number, optional): for OAuth credentials, the `expires` timestamp from `auth.json`.
- `custom` (boolean, optional): `true` iff the bridge itself registered this provider via `pi.registerProvider(...)` from `~/.pi/agent/providers.json`. Consumers (notably `provider-auth-storage.ts::_buildAuthStatus`) SHALL use this flag to suppress API-key auth rows for custom providers, which are managed by the dedicated **LLM Providers** settings section.

The catalogue SHALL be the union of `authStorage.getOAuthProviders().map(p => p.id)` AND every distinct `provider` value from `modelRegistry.getAll()`. Duplicates are deduplicated by `id`.

The `custom` flag SHALL be set synchronously when the bridge attempts to register a provider from `providers.json`, **independently** of asynchronous model-discovery completion. Specifically, the bridge SHALL track custom-provider ids the moment `registerEntry` is invoked — before any `await` — so that the very first `providers_list` push (typically fired from `session_start` shortly after `activate()` kicked off async `registerEntry` calls) carries the correct flags. This rules out a race where the first push leaks custom providers into Settings → API Keys until the async discovery probe resolves.

#### Scenario: Built-in API-key provider
- **WHEN** pi-ai's `MODELS` table contains a model with `provider: "deepseek"` and the user has not configured any auth
- **THEN** the catalogue SHALL contain `{id: "deepseek", displayName: "DeepSeek", hasOAuth: false, configured: false, envVar: undefined, ambient: undefined}` with no `custom` field

#### Scenario: Provider with env var set but no auth.json entry
- **WHEN** `OPENAI_API_KEY` is exported to the bridge process
- **THEN** the `openai` catalogue entry SHALL have `configured: false`, `source: "environment"`, `envVar: "OPENAI_API_KEY"`

#### Scenario: OAuth provider with stored credentials
- **WHEN** `auth.json` contains `{ "anthropic": { type: "oauth", access, refresh, expires } }`
- **THEN** the `anthropic` catalogue entry SHALL have `hasOAuth: true`, `configured: true`, `source: "stored"`, `expires: <timestamp>`

#### Scenario: Ambient credential (Vertex ADC)
- **WHEN** `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` are all set
- **THEN** the `google-vertex` catalogue entry SHALL have `ambient: true` and `source: "environment"`

#### Scenario: Extension-registered provider visible
- **WHEN** another pi extension calls `pi.registerProvider("custom-llm", { models: [...], oauth: {...} })`
- **THEN** the next `providers_list` push SHALL contain a `custom-llm` entry with `hasOAuth: true`

#### Scenario: Saved custom provider reports configured (regression)
- **WHEN** `~/.pi/agent/providers.json` contains a `proxy` entry with a valid `apiKey` and the bridge has registered it via `registerEntry`
- **AND** `auth.json` has NO `proxy` entry (the key lives only in pi's `providerRequestConfigs`)
- **THEN** `modelRegistry.getProviderAuthStatus("proxy").configured` SHALL be `true`
- **AND** the `proxy` catalogue entry SHALL have `configured: true`
- **AND** the dashboard SHALL NOT display "no API key setup" for `proxy`

#### Scenario: Custom provider from providers.json carries custom:true on first push (regression)
- **WHEN** `~/.pi/agent/providers.json` contains a `proxy` entry with `baseUrl` pointing to an OpenAI-compatible endpoint
- **AND** the bridge's `activate()` has begun async `registerEntry("proxy", ...)` but `discoverModels` for `proxy` has NOT yet resolved
- **AND** the bridge calls `buildProviderCatalogue()` to build the first `providers_list` payload
- **THEN** the catalogue SHALL include a `proxy` entry with `custom: true`
- **AND** the server-side consumer `_buildAuthStatus` SHALL skip emitting an API-key row for `proxy`
- **AND** Settings → Provider Authentication → API Keys SHALL NOT list `proxy`

#### Scenario: discoverModels failure for a custom provider
- **WHEN** the bridge's `discoverModels` for `proxy` resolves with HTTP failure or network timeout
- **THEN** `proxy` SHALL still be present in `lastRegistered`
- **AND** the next `providers_list` push SHALL still carry `custom: true` for `proxy`
- **AND** `proxy` SHALL still be filtered from Settings → API Keys
