## ADDED Requirements

### Requirement: Custom-provider auth SHALL be registered before spawns can occur

The dashboard SHALL register a custom provider's auth configuration (`providerRequestConfigs`, i.e. the apiKey) on the session's model registry synchronously at extension activation, BEFORE the asynchronous `/v1/models` discovery it performs for model-catalog enrichment. Registration of the auth SHALL NOT depend on a reachable `/v1/models` endpoint, and SHALL NOT clear or replace the existing model catalog (model list omitted). Because spawned flow-agent and sub-agent sessions inherit the parent session's model registry instance, the auth SHALL therefore be present before any flow or sub-agent can spawn.

#### Scenario: Flow agent node using a custom-provider role authenticates

- **GIVEN** `providers.json#roles` maps `@fast` to `home-proxy/cc/claude-haiku-4-5-20251001` and `home-proxy` has an inline `apiKey`
- **AND** a dashboard-spawned headless session runs a flow whose agent declares `model: "@fast"`
- **AND** the `home-proxy` `/v1/models` endpoint is slow or unreachable
- **WHEN** the agent node spawns and issues its first model request
- **THEN** the parent (and inherited child) registry SHALL already carry `home-proxy` auth (`providerRequestConfigs`)
- **AND** the node SHALL NOT fail with `No API key found for home-proxy`

#### Scenario: Auth pre-registration leaves the model catalog untouched

- **GIVEN** a custom provider being registered at activation
- **WHEN** the synchronous auth pre-registration runs (model list omitted)
- **THEN** any existing catalog for that provider SHALL be preserved (no empty-model replacement)
- **AND** the discovered models SHALL still be added once `/v1/models` resolves

### Requirement: Sub-agent sessions SHALL inherit the parent model registry

`Agent`-tool sub-agent sessions spawned by the dashboard SHALL be constructed with the parent session's model registry (`ctx.modelRegistry`) and auth storage, so they inherit every provider registered on the parent — including custom providers. A sub-agent SHALL NOT be constructed with a fresh disk-only registry that omits custom providers.

#### Scenario: Sub-agent using a custom-provider role authenticates

- **GIVEN** a dashboard session whose registry has `home-proxy` registered
- **WHEN** an `Agent`-tool sub-agent is spawned with a model that resolves to `home-proxy/...`
- **THEN** the sub-agent session SHALL be created with `modelRegistry: ctx.modelRegistry`
- **AND** the sub-agent SHALL NOT fail with `No API key found for home-proxy`

### Requirement: Provider registration failures SHALL be observable

The dashboard SHALL NOT silently swallow `registerEntry` failures during provider registration. A failure SHALL be logged with the provider name and the error, so an absent custom provider is diagnosable rather than invisible.

#### Scenario: registerEntry throws during startup

- **GIVEN** provider registration throws (e.g. a discovery error) during `activate()`
- **WHEN** the fire-and-forget registration rejects
- **THEN** the failure SHALL be logged with the provider name and error message
- **AND** the failure SHALL NOT be discarded by an empty `.catch(() => {})`
