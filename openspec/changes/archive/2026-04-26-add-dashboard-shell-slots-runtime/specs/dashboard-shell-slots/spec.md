## ADDED Requirements

### Requirement: Slot consumer per-claim error boundary

Each contribution rendered by a slot consumer SHALL be wrapped in its own error boundary. If one contribution throws during render, the boundary SHALL catch the error, log it to the console with the offending plugin id and slot id, render nothing for that specific contribution, and SHALL NOT prevent sibling contributions for the same slot from rendering.

The error boundary scope SHALL be **per-claim**, not per-slot. A slot rendering N contributions has N boundaries.

#### Scenario: One plugin throws, others continue rendering

- **WHEN** three plugins (A, B, C) each register a `session-card-badge` claim and B's component throws on first render
- **THEN** A's badge SHALL render, B's badge SHALL render nothing, C's badge SHALL render, and the console SHALL contain a single error mentioning plugin id "B" and slot id "session-card-badge".

#### Scenario: Slot with one throwing plugin still renders empty container

- **WHEN** the only plugin registered for `session-card-badge` throws on render
- **THEN** the slot consumer SHALL render no badge for that session and SHALL NOT propagate the error to its parent component (the session card SHALL still render).

#### Scenario: Subsequent renders of recovered claim succeed

- **WHEN** plugin B's component throws on the first render of session X but renders successfully on session Y
- **THEN** session X's row SHALL show no B badge, session Y's row SHALL show the B badge, and the error log SHALL identify only the failing render.

### Requirement: settings-section claims target a specific settings tab

The `settings-section` slot manifest SHALL accept an optional `tab` field on each claim. The value SHALL be one of the dashboard's existing settings tab ids (initial set: `"general"`, `"servers"`, `"packages"`, `"providers"`, `"security"`, `"advanced"`). When omitted, the loader SHALL default the claim to `"general"`.

The settings-section slot consumer SHALL be parameterized by `tab` and render only contributions whose `tab` matches. Unknown `tab` values SHALL be rejected at manifest validation time with an explicit error naming the plugin and the unknown value.

#### Scenario: Claim with no tab field defaults to general

- **WHEN** a plugin manifest claims `settings-section` with no `tab` field
- **THEN** the loader SHALL treat the claim as `tab: "general"` and the General tab SHALL render the contribution below the core sections.

#### Scenario: Claim targets the providers tab

- **WHEN** a plugin manifest claims `{ "slot": "settings-section", "tab": "providers", "component": "MyProviderRow" }`
- **THEN** the Providers tab SHALL render `MyProviderRow`, and other tabs SHALL not.

#### Scenario: Unknown tab value rejected

- **WHEN** a plugin manifest claims `{ "slot": "settings-section", "tab": "nonexistent" }`
- **THEN** manifest validation SHALL fail with an error naming the plugin id and the unknown tab value, the plugin SHALL be marked failed in `/api/health`, and other plugins SHALL load normally.

#### Scenario: Settings-section consumer renders nothing when no claims for tab

- **WHEN** the user opens the Security tab and no plugin claims `tab: "security"`
- **THEN** the existing core sections SHALL render unchanged and the slot consumer SHALL render no extra content (no divider, no placeholder).

### Requirement: Slot consumer reads registry via plugin context provider

The dashboard SHALL wrap its React tree in a single `<PluginContextProvider>` that exposes the slot registry to all descendant slot consumer components. Slot consumers SHALL NOT import the registry directly; they SHALL read it from context.

This enables tests to render slot consumers with a mocked registry without modifying any production code.

#### Scenario: Slot consumer reads from context

- **WHEN** a slot consumer renders inside `<PluginContextProvider value={mockRegistry}>`
- **THEN** the consumer SHALL render contributions from `mockRegistry`, not from the production registry.

#### Scenario: Slot consumer outside provider throws helpful error

- **WHEN** a slot consumer is rendered outside any `<PluginContextProvider>`
- **THEN** the consumer SHALL throw an error reading "Slot consumer must be rendered inside <PluginContextProvider>".

### Requirement: Per-plugin context layer scopes hooks to a plugin id

When a slot consumer renders a contribution, it SHALL wrap the contribution component in a nested context layer that records the contributing plugin's id. Hooks `usePluginConfig<T>()` and the contribution's `logger` SHALL read the nearest plugin id from this context, not from an explicit argument.

A plugin SHALL NOT be able to read another plugin's config via these hooks.

#### Scenario: Hook reads from nearest plugin context layer

- **WHEN** plugin A's contribution calls `usePluginConfig<T>()`
- **THEN** the hook SHALL return `plugins.A.*` from the dashboard config, not any other plugin's namespace.

#### Scenario: Hook called outside any plugin context throws

- **WHEN** a non-plugin component (e.g. a core dashboard component) calls `usePluginConfig<T>()`
- **THEN** the hook SHALL throw an error reading "usePluginConfig must be called from a plugin slot contribution".

#### Scenario: Logger namespace matches surrounding plugin id

- **WHEN** plugin B's contribution calls `pluginContext.logger.info("ready")`
- **THEN** the log line SHALL be prefixed with `[plugin:B]`, regardless of the calling component's file path.

### Requirement: Demo plugin exists as runtime fixture

The repository SHALL contain a private workspace package `packages/demo-plugin/` whose sole purpose is to exercise the runtime end-to-end in tests. The demo plugin SHALL claim at least `settings-section` (rendering a small React form persisting two fields) and `tool-renderer` (registering a synthetic `toolName: "DashboardDemo"`).

The demo plugin's `package.json` SHALL declare `"private": true`. The build pipeline SHALL exclude the demo plugin from production bundles whenever the manifest declares `"fixture": true` and `process.env.NODE_ENV === "production"`.

#### Scenario: Demo plugin loads in dev and test

- **WHEN** the dashboard runs in dev mode or under vitest
- **THEN** `/api/health.plugins[]` SHALL include `{ id: "demo", enabled: true, loaded: true, claims: 2 }`.

#### Scenario: Demo plugin excluded from production bundle

- **WHEN** `npm run build` produces a production client bundle and the demo plugin's manifest declares `"fixture": true`
- **THEN** the bundle SHALL NOT contain any code from `@blackbelt-technology/demo-plugin/client` (asserted by a build artifact scan in the test suite).

#### Scenario: Demo plugin tool renderer takes precedence

- **WHEN** a session emits a `tool_call` with `toolName: "DashboardDemo"`
- **THEN** the chat view SHALL render the demo plugin's component instead of `GenericToolRenderer`.
