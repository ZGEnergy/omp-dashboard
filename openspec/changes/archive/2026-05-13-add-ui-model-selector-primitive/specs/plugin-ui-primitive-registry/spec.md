## ADDED Requirements

### Requirement: `ui:model-selector` primitive key and contract

`packages/shared/src/dashboard-plugin/ui-primitives.ts` SHALL include `modelSelector: "ui:model-selector"` in `UI_PRIMITIVE_KEYS` and a matching entry in `UiPrimitiveMap`. The primitive SHALL expose a model picker with built-in provider filter, typeahead, keyboard navigation, and pending-state with timeout — the existing capability of `packages/client/src/components/ModelSelector.tsx`.

The contract:

- `"ui:model-selector"`: `ComponentType<{ current?: string; models?: ModelInfo[]; onSelect: (modelLabel: string) => void }>`

Where:

- `current` is a string in `"<provider>/<id>"` form, or `undefined` for "no current".
- `models` is the list of available models as `ModelInfo[]` from `packages/shared/src/types.ts`, or `undefined` when models have not yet loaded (in which case the primitive renders the current label as non-interactive text).
- `onSelect(modelLabel)` is called with the full `"<provider>/<id>"` string of the chosen model.

The contract SHALL NOT expose role/preset props — role management is a separate concern owned by `BuiltInRolesSettings` (in builtins-plugin) and is layered on top of this primitive, not inside it.

#### Scenario: Key is part of `UI_PRIMITIVE_KEYS`

- **WHEN** importing `UI_PRIMITIVE_KEYS` from the shared package
- **THEN** the object SHALL contain `modelSelector` with value `"ui:model-selector"`
- **AND** `UiPrimitiveKey` SHALL include the literal `"ui:model-selector"` in its union

#### Scenario: Contract is typed in `UiPrimitiveMap`

- **WHEN** TypeScript resolves `UiPrimitiveMap["ui:model-selector"]`
- **THEN** the resolved type SHALL be `ComponentType<{ current?: string; models?: ModelInfo[]; onSelect: (modelLabel: string) => void }>`

#### Scenario: Plugin can consume the primitive without importing client internals

- **WHEN** a plugin module imports `useUiPrimitive` from `@blackbelt-technology/dashboard-plugin-runtime` and calls `useUiPrimitive("ui:model-selector")`
- **THEN** the call SHALL type-check
- **AND** the returned value at runtime SHALL be the registered `ModelSelector` impl
- **AND** the plugin's package.json SHALL NOT need to declare `@blackbelt-technology/pi-dashboard-web` as a dependency to render a model selector

### Requirement: Dashboard registers `ui:model-selector` at startup

`packages/client/src/main.tsx` SHALL register the existing `ModelSelector` component (from `packages/client/src/components/ModelSelector.tsx`) under the key `"ui:model-selector"` before mounting `<App>`, alongside the other primitive registrations.

The registered component SHALL preserve `ModelSelector`'s existing public surface — no wrapper that drops props or alters event timing.

#### Scenario: `useUiPrimitive("ui:model-selector")` returns the impl

- **WHEN** the dashboard boots and `<App>` mounts
- **THEN** calling `useUiPrimitive("ui:model-selector")` from any descendant SHALL return the registered impl
- **AND** the returned component SHALL render the same DOM tree as `StatusBar`'s usage when given identical props

#### Scenario: IntentRenderer can resolve a server-emitted model-selector intent

- **WHEN** a plugin's server entry emits `{ primitive: "ui:model-selector", props: { current, models }, actions: { onSelect: { action: "...", payload: {} } } }`
- **THEN** `IntentRenderer` SHALL resolve the primitive via `useUiPrimitiveOrNull` and render the registered impl
- **AND** the impl's `onSelect` SHALL be wired to `send("...", { ...payload, modelLabel })` — using the wireActions descriptor pathway

### Requirement: Existing `StatusBar` usage SHALL remain direct-import

`packages/client/src/components/StatusBar.tsx` SHALL keep its direct `import { ModelSelector } from "./ModelSelector.js"`. The primitive registry is for plugin consumers; the dashboard shell continues to import shell-private components directly. This keeps the StatusBar's call graph trivially analyzable and avoids a registry round-trip for first-party code.

#### Scenario: StatusBar source unchanged

- **WHEN** inspecting `packages/client/src/components/StatusBar.tsx` after this change lands
- **THEN** the file SHALL still import `ModelSelector` directly from `./ModelSelector.js`
- **AND** the file SHALL NOT call `useUiPrimitive("ui:model-selector")`
