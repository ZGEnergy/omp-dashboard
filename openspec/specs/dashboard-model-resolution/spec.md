# dashboard-model-resolution Specification

## Purpose

Owns the `model:resolve` event handler registered by the pi-agent-dashboard extension. Resolves three input forms — `@role`, `provider/model[:thinking]`, and bare `model-id` — against `pi.modelRegistry` and `~/.pi/agent/providers.json#roles`, filling a cooperative probe object. Includes a deprecated `flow:resolve-model` alias kept for one release.

## Requirements

### Requirement: pi-agent-dashboard SHALL register a `model:resolve` listener

The dashboard extension SHALL register `pi.events.on("model:resolve", async (probe) => { … })` exactly once at activation. The listener SHALL handle three input forms — `@role`, `provider/model[:thinking]`, and bare `model-id` — and SHALL fill the probe according to the contract documented in pi-dashboard-subagents' spec `subagent-role-aliasing`.

The listener SHALL follow the cooperative early-return idiom: if `probe.model` is already set when the listener runs, it SHALL return immediately without further work.

#### Scenario: One listener at activation

- **WHEN** the dashboard extension's `activate(pi)` runs
- **THEN** there SHALL be exactly one `pi.events.on("model:resolve", …)` invocation in the extension's bootstrap
- **AND** the listener function SHALL early-return when `probe.model` is truthy

#### Scenario: @role resolution reads providers.json#roles

- **GIVEN** `~/.pi/agent/providers.json` contains `roles: { fast: "anthropic/claude-haiku-4-5" }`
- **WHEN** the listener receives `{ ref: "@fast" }`
- **THEN** the listener SHALL look up `roles["fast"]` from the file
- **AND** SHALL resolve the literal `"anthropic/claude-haiku-4-5"` to a Model via `pi.modelRegistry.find("anthropic", "claude-haiku-4-5")`
- **AND** SHALL set `probe.resolved = "anthropic/claude-haiku-4-5"` and `probe.model = <Model>`
- **AND** SHALL also fill `probe.auth = await registry.getApiKeyAndHeaders(model)`

#### Scenario: provider/model resolution via registry.find

- **GIVEN** `pi.modelRegistry.find("anthropic", "claude-opus-4")` returns a Model
- **WHEN** the listener receives `{ ref: "anthropic/claude-opus-4" }`
- **THEN** the listener SHALL split the ref on `/` and call `registry.find("anthropic", "claude-opus-4")`
- **AND** SHALL fill `probe.model`, `probe.resolved`, `probe.auth` as above

#### Scenario: Bare model id resolution via registry.getAll "like" query

- **GIVEN** `pi.modelRegistry.getAll()` returns models including `{ id: "claude-haiku-4-5", provider: "anthropic" }`
- **WHEN** the listener receives `{ ref: "claude-haiku-4-5" }` (no `/`, no `@`)
- **THEN** the listener SHALL call `registry.getAll().find(m => m.id === "claude-haiku-4-5")`
- **AND** SHALL fill `probe.model` with the first match in iteration order
- **AND** SHALL fill `probe.resolved = "anthropic/claude-haiku-4-5"` using the matched model's provider

#### Scenario: Thinking suffix is parsed before registry lookup

- **GIVEN** the listener receives `{ ref: "anthropic/claude-haiku-4-5:high" }`
- **WHEN** the listener parses the ref
- **THEN** `probe.thinkingLevel` SHALL be set to `"high"`
- **AND** the registry lookup SHALL use `"anthropic"`/`"claude-haiku-4-5"` (suffix stripped)
- **AND** `probe.resolved` SHALL be `"anthropic/claude-haiku-4-5"` (no suffix)

#### Scenario: Unknown @role surfaces error with available roles hint

- **GIVEN** `providers.json#roles` contains `{ fast: "...", research: "..." }` but NOT `unknownrole`
- **WHEN** the listener receives `{ ref: "@unknownrole" }`
- **THEN** the listener SHALL set `probe.error` to a string naming the unresolved ref
- **AND** SHALL set `probe.available.roles = { fast: "...", research: "..." }`
- **AND** SHALL NOT set `probe.model`

#### Scenario: Unknown bare id surfaces error with available models hint

- **GIVEN** `pi.modelRegistry.getAll()` returns models with ids `["a", "b", "c"]`
- **WHEN** the listener receives `{ ref: "made-up-model" }`
- **THEN** the listener SHALL set `probe.error` naming the unresolved ref
- **AND** SHALL set `probe.available.models` to a list including those known ids (capped to at most 20)
- **AND** SHALL NOT set `probe.model`

#### Scenario: Cooperative early-return when probe.model already set

- **GIVEN** another handler already filled `probe.model` before this listener runs
- **WHEN** the listener executes
- **THEN** the listener SHALL detect `probe.model` is truthy and return immediately
- **AND** SHALL NOT modify any field on the probe
- **AND** SHALL NOT call `pi.modelRegistry`

### Requirement: The legacy `flow:resolve-model` listener SHALL remain registered as a deprecated alias

For one release after this change lands, the dashboard SHALL continue to register `pi.events.on("flow:resolve-model", …)` with the pre-change behavior (handles literal `provider/model` and bare `model-id` only; skips `@role`; reads `data.modelRef` not `data.ref`). The handler body is unchanged from its pre-change form.

The implementation file SHALL annotate this listener with a `// DEPRECATED` comment naming the replacement (`model:resolve`) and stating that the listener is removed in the next major release.

#### Scenario: flow:resolve-model still works for the legacy probe shape

- **WHEN** an external extension emits `pi.events.emit("flow:resolve-model", { modelRef: "anthropic/claude-haiku-4-5" })`
- **THEN** the dashboard's deprecated handler SHALL run
- **AND** SHALL fill `data.model` with the Model resolved via `pi.modelRegistry.find()`
- **AND** SHALL fill `data.auth`

#### Scenario: flow:resolve-model continues to skip @role

- **WHEN** an external extension emits `pi.events.emit("flow:resolve-model", { modelRef: "@fast" })`
- **THEN** the deprecated handler SHALL return early without filling anything
- **AND** SHALL NOT read `providers.json#roles`

### Requirement: The probe shape SHALL be additively extensible

The `model:resolve` probe SHALL accept additional fields without rejection. Handlers SHALL ignore unknown keys on the probe object. Future fields (e.g. `cacheControl`, `timeoutMs`) can be added by emitters without coordinated handler upgrades.

#### Scenario: Unknown probe fields are silently tolerated

- **GIVEN** an emitter sends `{ ref: "@fast", futureField: "ignored" }`
- **WHEN** the listener processes the probe
- **THEN** the listener SHALL behave exactly as if `futureField` were absent
- **AND** the listener SHALL NOT modify `futureField`
- **AND** the listener SHALL fill `probe.model` (or `probe.error`) per the ref

### Requirement: The `model:resolve` handler SHALL be re-entrant and stateless beyond cached file reads

The handler SHALL NOT cache resolution results across calls beyond what `pi.modelRegistry` itself caches. The handler MAY (but is not required to) cache `providers.json` reads with an mtime check. Multiple concurrent emits SHALL be safe — each probe is independent.

#### Scenario: Two concurrent emits do not interfere

- **WHEN** the application emits `model:resolve` twice with different refs in rapid succession
- **THEN** each probe SHALL be filled independently
- **AND** neither resolution SHALL affect the other
- **AND** no mutable module state SHALL be visible to or modified by other probes

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
