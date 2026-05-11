## MODIFIED Requirements

### Requirement: The primitive registry SHALL be consumed by the shell's IntentRenderer, not by plugin code

The primitive registry's mechanism — `createUiPrimitiveRegistry`, `registerUiPrimitive`, `UiPrimitiveProvider`, `useUiPrimitive`, `useUiPrimitiveOrNull` — SHALL survive unchanged. The currently-registered primitives SHALL stay registered. Adding new primitives still requires three steps: extend `UI_PRIMITIVE_KEYS`, extend `UiPrimitiveMap`, register an impl in `main.tsx`.

What changes: the expected caller of `useUiPrimitive(...)` SHALL move from plugin React components to the shell's `IntentRenderer`. Plugins SHALL NOT directly call `useUiPrimitive` from their client-side code as a renderer of their own state. The shell, on each connected client, SHALL call `useUiPrimitive(intent.primitive)` inside `IntentRenderer` to resolve a primitive name from an incoming intent to a `ComponentType` for rendering.

This SUPERSEDES the usage pattern established by the archived change `add-plugin-ui-primitive-registry` (2026-05-11), where plugins like flows-plugin called `useUiPrimitive` from inside their React components. That pattern, while functional, runs plugin React code in every connected client independently — incompatible with multi-client state coherence. The new pattern keeps the registry's mechanism and moves the call site to the shell.

#### Scenario: Plugin's intent uses a registered primitive name

- **GIVEN** the dashboard has registered `UI_PRIMITIVE_KEYS.agentCard` → `AgentCardShell` at startup
- **WHEN** a plugin broadcasts an intent `{primitive:"ui:agent-card", props:{name:"Explore", status:"running"}}`
- **THEN** the shell's IntentRenderer SHALL resolve "ui:agent-card" via `useUiPrimitive(UI_PRIMITIVE_KEYS.agentCard)`
- **AND** render `<AgentCardShell name="Explore" status="running" />` in the target slot

#### Scenario: Plugin emits intent referencing an unregistered primitive name

- **WHEN** a plugin broadcasts `{primitive:"my-custom-thing", props:{...}}` and the primitive is not registered
- **THEN** the IntentRenderer SHALL use `useUiPrimitiveOrNull` and receive `null`
- **AND** render an inline error placeholder identifying the missing primitive name and the broadcasting pluginId
- **AND** sibling intent contributions continue to render normally

### Requirement: Plugin client-side `useUiPrimitive` calls SHALL be marked DEPRECATED

Plugin code that still imports `useUiPrimitive` (today, flows-plugin's 9 client files) SHALL continue to work — the API is not removed. But the JSDoc on the exported `useUiPrimitive` hook SHALL include a deprecation notice directing plugin authors to the intent broadcast pattern. The deprecation is documentation-only; runtime behavior is unchanged for legacy callers.

The repo-lint `no-primitive-direct-import.test.ts` (introduced by `add-plugin-ui-primitive-registry`) SHALL be relaxed from "fail on direct import" to "warn on direct import" during the migration period. Once flows-plugin has fully migrated, the lint may be re-tightened to forbid direct imports AND `useUiPrimitive` calls from plugin code entirely.

#### Scenario: JSDoc marks plugin-callsite useUiPrimitive as deprecated

- **GIVEN** plugin author reads the `useUiPrimitive` hook definition
- **WHEN** they look at the IDE hover or JSDoc preview
- **THEN** they SHALL see a deprecation notice stating: "Plugin code SHOULD emit intent broadcasts via ServerPluginContext.broadcastToSubscribers instead of calling useUiPrimitive directly. See plugin-intent-protocol."

## REMOVED Requirements

### Requirement: ~~Plugins look up shell components via `useUiPrimitive(key)` from inside React contributions~~

**Reason for removal:** This requirement (originally from `add-plugin-ui-primitive-registry`) made plugins call `useUiPrimitive` from inside their client React code to render shared shell components. This pattern requires plugin code to RUN in every connected client, which is incompatible with the multi-client state coherence required by the new intent rendering protocol. The new mechanism (intent broadcasts + IntentRenderer) supersedes this pattern; plugin code lives on the server and emits intent trees that the shell renders via the same primitive registry (now consumed by the shell, not plugins).

The replacement requirement is "Plugins SHALL emit UI intents via the bridge" in the `plugin-intent-protocol` capability.
