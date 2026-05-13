## ADDED Requirements

### Requirement: `ModelSelector` is reachable from plugins via the primitive registry

The same `ModelSelector` component used by `StatusBar` SHALL be reachable from any plugin via `useUiPrimitive("ui:model-selector")` without the plugin importing client internals or declaring `@blackbelt-technology/pi-dashboard-web` as a dependency. Plugins consuming the primitive SHALL get identical behavior (provider filter, typeahead, keyboard navigation, pending-state with 10 s timeout) to the StatusBar's usage.

#### Scenario: Builtins-plugin consumes the primitive

- **WHEN** the builtins-plugin's `BuiltInRolesSettings` renders the per-role model picker
- **THEN** it SHALL obtain the picker via `useUiPrimitive("ui:model-selector")`
- **AND** SHALL NOT contain its own inline picker JSX duplicating provider filter / typeahead behavior
- **AND** SHALL NOT add `@blackbelt-technology/pi-dashboard-web` to its `dependencies`

#### Scenario: Selection emits `"provider/modelId"` to the host

- **WHEN** the user picks a model from the picker rendered inside `BuiltInRolesSettings`
- **THEN** the host's `onSelect` callback SHALL be invoked with the full `"<provider>/<id>"` string (matching `StatusBar`'s existing semantics)
- **AND** the host SHALL forward that exact string as the `modelId` field of the outgoing `role_set` WebSocket message

### Requirement: Role values persist in `"provider/modelId"` form

When `BuiltInRolesSettings` writes a role assignment, the `modelId` field of the `role_set` WebSocket message SHALL be the full `"<provider>/<id>"` string. Bridge extension (`packages/extension/src/bridge.ts`) and pi-flows `role-manager.ts` already pass the `modelId` value through verbatim, so the persisted role entry in `~/.pi/agent/providers.json#roles` SHALL contain the full `"<provider>/<id>"` string after this change lands.

This makes the persisted role value resolvable unambiguously by pi-flows' `flow-engine/execution.ts` — its existing `modelId.split("/")` path picks the provider-aware `modelRegistry.find(provider, id)` branch when `parts.length >= 2`, so the architect agent (which uses `model: @planning`) SHALL find the correct model in the registry.

#### Scenario: Writing a role yields a slash-form value on disk

- **GIVEN** a user assigns the model labeled `proxy/cc/deepseek-v4-flash` to role `planning` via `BuiltInRolesSettings`
- **WHEN** the dashboard finishes its WebSocket round-trip with pi-flows
- **THEN** `~/.pi/agent/providers.json#roles.planning` SHALL equal `"proxy/cc/deepseek-v4-flash"`

#### Scenario: pi-flows resolves the role via the provider-aware path

- **GIVEN** `roles.planning` is `"proxy/cc/deepseek-v4-flash"`
- **WHEN** pi-flows spawns the architect (which declares `model: @planning`)
- **THEN** `resolveModel("@planning", …)` SHALL return `{ modelId: "proxy/cc/deepseek-v4-flash" }`
- **AND** `execution.ts` SHALL call `options.modelRegistry.find("proxy", "cc/deepseek-v4-flash")`
- **AND** the lookup SHALL succeed (assuming the proxy provider is registered and has that model)
- **AND** the architect SHALL spawn against the correct provider's credentials and base URL

### Requirement: Read-time migration of legacy bare-id role values

`BuiltInRolesSettings` SHALL handle legacy role entries whose stored value is a bare model id (no `/`) without throwing or rendering nonsense. When rendering the current selection for such a role, the component SHALL look up the first model in the live `models` list whose `.id === stored` and synthesize the `current` prop as `"${that.provider}/${stored}"`. If no live model matches, the component SHALL pass the bare value through as `current` and let the primitive render it as plain text.

Migration SHALL be read-only — the component MUST NOT write to disk on load. The first time the user re-picks a role, the canonical `"provider/id"` form is written, which over time normalizes the file.

#### Scenario: Bare-id entry displays correctly

- **GIVEN** `~/.pi/agent/providers.json#roles.planning` is the legacy bare value `"deepseek-v4-flash"`
- **AND** the live `models` list contains `{ provider: "proxy", id: "deepseek-v4-flash", … }`
- **WHEN** the user opens the Settings → Roles page
- **THEN** the `@planning` role pill SHALL display the model label sourced from `"proxy/deepseek-v4-flash"`
- **AND** the primitive's `current` prop SHALL be `"proxy/deepseek-v4-flash"`
- **AND** no write SHALL be issued to `providers.json`

#### Scenario: Bare-id entry with no live match degrades gracefully

- **GIVEN** `roles.planning` is `"some-removed-model"`
- **AND** no live model has `.id === "some-removed-model"`
- **WHEN** the Roles page renders
- **THEN** the pill SHALL display `"some-removed-model"` as plain text
- **AND** the primitive SHALL render its non-interactive fallback (matching its existing `models === undefined` behavior)
- **AND** no error SHALL be thrown
