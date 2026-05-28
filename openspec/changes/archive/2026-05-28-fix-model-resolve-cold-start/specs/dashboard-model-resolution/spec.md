## ADDED Requirements

### Requirement: The `model:resolve` handler SHALL succeed at cold-start by falling back to `pi.modelRegistry`

The dashboard's `getModelRegistry()` helper SHALL return the lazily-captured `modelRegistryRef` when it is non-null, and SHALL otherwise fall back to `pi.modelRegistry` (read via the module-level `piRef` set at `activate(pi)` time). This ensures that `model:resolve` probes arriving BEFORE any `session_start` or `model_select` event has populated `modelRegistryRef` still find a registry and complete normally instead of failing with `probe.error = "Model registry unavailable…"`.

The fallback SHALL NOT mutate `modelRegistryRef`. The lazy-capture path via session/model_select event contexts remains the canonical warm-up; the `pi.modelRegistry` fallback is a per-call rescue used only when the canonical capture has not yet occurred.

When BOTH `modelRegistryRef` and `pi.modelRegistry` are null/undefined (degenerate misconfiguration), the existing `probe.error = "Model registry unavailable…"` behaviour SHALL still apply.

#### Scenario: Cold-start probe succeeds via `pi.modelRegistry` fallback

- **GIVEN** the dashboard extension has just activated AND no `session_start` or `model_select` event has fired yet AND `modelRegistryRef` is `null`
- **AND** `pi.modelRegistry` is a valid registry with `find` and `getAll` methods
- **WHEN** an emitter calls `pi.events.emit("model:resolve", { ref: "anthropic/claude-haiku-4-5" })`
- **THEN** the handler SHALL use `pi.modelRegistry.find("anthropic", "claude-haiku-4-5")`
- **AND** SHALL fill `probe.model` with the resolved Model
- **AND** SHALL fill `probe.resolved` and `probe.auth` per the existing contract
- **AND** `probe.error` SHALL remain unset

#### Scenario: Warm `modelRegistryRef` is preferred when present

- **GIVEN** `modelRegistryRef` has been populated by a prior `session_start` event AND `pi.modelRegistry` is also accessible
- **WHEN** a `model:resolve` probe arrives
- **THEN** the handler SHALL use `modelRegistryRef` for the lookup (the warm reference wins)
- **AND** `modelRegistryRef` SHALL NOT be mutated by the resolution

#### Scenario: Both references null still produces the registry-unavailable error

- **GIVEN** `modelRegistryRef` is `null` AND `pi.modelRegistry` is `undefined`/`null` (degenerate misconfiguration)
- **WHEN** a `model:resolve` probe arrives
- **THEN** the handler SHALL set `probe.error = "Model registry unavailable — cannot resolve \"<ref>\"."`
- **AND** SHALL NOT throw
- **AND** SHALL NOT fill `probe.model`

#### Scenario: Cold-start fallback also fixes `@role` resolution

- **GIVEN** `modelRegistryRef` is `null` AND `pi.modelRegistry` is reachable AND `providers.json#roles["fast"]` is `"opencode-go/deepseek-v4-flash"`
- **WHEN** an emitter calls `pi.events.emit("model:resolve", { ref: "@fast" })`
- **THEN** the handler SHALL look up the role mapping via `getModelRole("fast")`
- **AND** SHALL then call `pi.modelRegistry.find("opencode-go", "deepseek-v4-flash")` via the fallback
- **AND** SHALL fill `probe.model` and `probe.resolved` as in the warm path
