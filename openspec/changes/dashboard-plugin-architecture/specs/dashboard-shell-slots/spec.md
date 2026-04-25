## ADDED Requirements

### Requirement: Slot taxonomy is a frozen, named list

The dashboard SHALL expose a fixed set of named slots, defined as a TypeScript union in `@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-types.ts`. Each slot SHALL have a stable string id and a typed payload contract. Slot ids SHALL NOT be renamed or removed within a major version.

The slot taxonomy SHALL include at minimum:

```ts
type SlotId =
  // first-party React-targeted slots
  | "sidebar-folder-section"
  | "session-card-badge"
  | "session-card-action-bar"
  | "content-view"
  | "content-header-sticky"
  | "content-inline-footer"
  | "anchored-popover"
  | "command-route"
  | "settings-section"
  | "tool-renderer"
  // descriptor-renderable slots (shared with extension-ui-system)
  | "management-modal"
  | "footer-segment"
  | "agent-metric"
  | "breadcrumb"
  | "gate"
  | "toast"
  | "rjsf-form";
```

Each slot id SHALL be associated with a payload type and a `multiplicity` (`one` | `many` | `one-active`).

#### Scenario: Slot id is referenced via type import

- **WHEN** a plugin or shell component declares a claim on a slot
- **THEN** the slot id SHALL be passed as a typed `SlotId` value, not as a free string, so renames produce TypeScript errors.

#### Scenario: Adding a new slot is a minor version bump

- **WHEN** a new slot id is added to the union
- **THEN** the change SHALL be a minor (non-breaking) version of `pi-dashboard-shared`, since existing plugins that don't reference the new slot are unaffected.

#### Scenario: Removing a slot is a major version bump

- **WHEN** a slot id is removed
- **THEN** the change SHALL be a major version, and plugins claiming that slot fail to load with an explicit error.

### Requirement: Each slot accepts a payload tier

Every slot SHALL declare which payload tiers it accepts: `react-only`, `descriptor-only`, or `react-or-descriptor`. The shell's slot consumer for each slot SHALL accept the declared tiers and reject others at registration time.

#### Scenario: React-only slot rejects descriptor

- **WHEN** an `extension-ui-system` descriptor targets `content-inline-footer` (React-only)
- **THEN** the slot consumer SHALL log a warning, ignore the descriptor, and not render anything for it.

#### Scenario: Descriptor-only slot rejects React component

- **WHEN** a first-party plugin attempts to register a React component for `toast` (descriptor-only)
- **THEN** the plugin loader SHALL fail validation at startup with an error naming the offending plugin and slot.

#### Scenario: React-or-descriptor slot accepts both

- **WHEN** a first-party plugin and a third-party extension both target `session-card-badge` for the same session
- **THEN** both contributions SHALL render, ordered by `priority` then plugin id.

### Requirement: Slot multiplicity governs rendering

Each slot SHALL declare its multiplicity:

- `one` — exactly one contribution allowed; collision at registration is a fatal load-time error.
- `many` — any number of contributions; all render, ordered by `priority` then alphabetical plugin id.
- `one-active` — many contributions register; only one is "active" at a time, selected by route or interaction.

#### Scenario: Many-multiplicity slot renders all contributions

- **WHEN** three plugins register for `session-card-badge`
- **THEN** all three badges SHALL render in priority order.

#### Scenario: One-active multiplicity routes to a single contribution

- **WHEN** the user navigates to `/specs` and one plugin registers `command-route` for that path
- **THEN** that plugin's `content-view` component SHALL render, replacing `ChatView`.

#### Scenario: Collision on `command-route` is a load error

- **WHEN** two plugins both register `command-route` for `/openspec`
- **THEN** the loader SHALL report an explicit collision error naming both plugins and abort startup.

### Requirement: Slot consumer components iterate the registry

For each slot, the dashboard shell SHALL provide a single consumer component (e.g. `<SidebarFolderSectionSlot folder={f} />`, `<SessionCardBadgeSlot session={s} />`, `<ContentViewSlot session={s} route={r} />`). The consumer SHALL:

1. Read the slot registry produced by the plugin loader.
2. Filter contributions applicable to the current props (e.g. session-scoped contributions to the current session).
3. Render each contribution in priority order with a typed `SlotProps` payload.

The consumer SHALL not assume any specific plugin exists. If no contributions are registered for the slot, the consumer SHALL render nothing (no fallback content, no placeholder).

#### Scenario: Empty slot renders nothing

- **WHEN** no plugin claims `sidebar-folder-section` and the openspec plugin is disabled
- **THEN** the folder header in the session list SHALL render no extra content; the session list itself remains visible.

#### Scenario: Session-scoped contribution

- **WHEN** a plugin's `session-card-badge` claim has a `predicate(session)` returning true only for sessions in `/Users/me/repo`
- **THEN** the badge SHALL render only on those sessions; other sessions render no badge from that plugin.

### Requirement: Slot context props are typed per-slot

The shell SHALL pass typed props to every slot contribution component. Each slot id SHALL have a corresponding `SlotProps<SlotId>` type. Plugins SHALL receive only the props for the slot they claim.

#### Scenario: Session-card-badge receives session

- **WHEN** the shell renders a `session-card-badge` claim
- **THEN** the component SHALL receive `{ session: DashboardSession; pluginContext: PluginContext }`.

#### Scenario: Content-view receives session and route params

- **WHEN** the shell routes to a `command-route` claim
- **THEN** the contribution SHALL receive `{ session: DashboardSession; routeParams: Record<string, string>; onClose: () => void; pluginContext: PluginContext }`.

#### Scenario: Anchored-popover receives anchor element

- **WHEN** the shell shows an `anchored-popover` claim triggered by a button
- **THEN** the contribution SHALL receive `{ anchorEl: HTMLElement; onDismiss: () => void; pluginContext: PluginContext }`.

### Requirement: Plugin priority orders contributions deterministically

When multiple plugins claim the same `many`-multiplicity slot, render order SHALL be:

1. By `priority` ascending (lower is first).
2. Tie-break by plugin `id` alphabetical ascending.

Default priority SHALL be `1000`. First-party plugins use `100`. The dashboard SHALL log a warning at startup if any priority is `< 0` or `> 10000`.

#### Scenario: First-party plugin renders before third-party

- **WHEN** `openspec-plugin` (priority 100) and a hypothetical third-party extension (priority 1000) both contribute `session-card-badge`
- **THEN** the OpenSpec badge SHALL render first.

#### Scenario: Tie-break by id

- **WHEN** two plugins both have priority 100 and claim `sidebar-folder-section`
- **THEN** the plugin whose `id` sorts first alphabetically SHALL render first.

### Requirement: settings-section slot hosts plugin-owned settings UI

The `settings-section` slot SHALL render contributions inside the dashboard's Settings page (`SettingsPanel`). Contributions are sorted by plugin `priority` then alphabetical id. The slot accepts both React components (first-party plugins) and JSON-Schema-bearing descriptors (third-party extensions) per the slot's `react-or-descriptor` tier.

Each `settings-section` contribution SHALL receive `pluginContext` (React variant) or `formValue` + `onChange` (descriptor variant). React contributions persist via `pluginContext.updatePluginConfig({...})`; descriptor contributions persist via the dashboard's standard form-submit handler.

#### Scenario: Plugin section appears below core sections

- **WHEN** the user opens the Settings page
- **THEN** the page SHALL render core sections first (General, Auth, Providers, Network, Packages, Pi Core, Tools), then a divider, then plugin contributions in priority order.

#### Scenario: First-party plugin contributes React settings

- **WHEN** OpenSpec plugin's manifest claims `settings-section` with `component: "OpenSpecSettings"`
- **THEN** the SettingsPanel SHALL render the `OpenSpecSettings` component inside a labelled, collapsible section.

#### Scenario: Third-party extension contributes descriptor settings

- **WHEN** an extension pushes `{ kind: "settings-section", namespace: "judo", schema: {...JSON Schema...} }` via the `extension-ui-system` probe
- **THEN** the SettingsPanel SHALL render the schema using the simple `UiField` form (Phase 1 of `extension-ui-system`) or RJSF (Phase 4 once shipped), inside a labelled section titled by the descriptor's `title`.

#### Scenario: Reactive update on config change

- **WHEN** a plugin's `updatePluginConfig({...})` succeeds
- **THEN** the server SHALL broadcast `plugin_config_update { id, config }`, and any subscribed `usePluginConfig<T>()` consumers in *any* plugin or section SHALL re-render with the new value within one frame.

#### Scenario: Plugin without settings claim renders nothing

- **WHEN** a plugin has no `settings-section` claim
- **THEN** the SettingsPanel SHALL render no entry for that plugin and SHALL NOT log a warning.

### Requirement: tool-renderer slot maps a tool name to a React renderer

The `tool-renderer` slot SHALL accept React-only contributions. Each claim SHALL declare a `toolName: string` (the value of `tool_call.toolName` to render) and a `component` (an exported React component implementing the existing `ToolRenderer` signature). When the dashboard chat renders a tool call whose `toolName` matches a registered claim, the slot consumer SHALL use the registered component instead of the built-in `GenericToolRenderer`.

Multiple plugins MAY register `tool-renderer` claims for distinct tool names. Two claims for the same tool name are a load-time error (collision rule for `one`-multiplicity per tool name).

#### Scenario: Plugin's tool-renderer takes precedence over generic renderer

- **WHEN** a plugin claims `tool-renderer` with `toolName: "Agent"` and a session emits a `tool_call` with that tool name
- **THEN** the dashboard SHALL render the tool call using the plugin's component, not `GenericToolRenderer`.

#### Scenario: Two plugins claim the same tool name

- **WHEN** plugin A and plugin B both claim `tool-renderer` for `toolName: "Agent"`
- **THEN** the loader SHALL report a fatal collision error naming both plugins and the conflicting tool name, and abort startup.

#### Scenario: Tool with no claim falls through to generic renderer

- **WHEN** a tool call's `toolName` matches no registered claim
- **THEN** the dashboard SHALL render it with `GenericToolRenderer` (existing behavior preserved).

#### Scenario: Plugin component crashes during render

- **WHEN** a plugin's tool-renderer component throws on first render
- **THEN** the slot consumer's error boundary SHALL catch it, fall back to `GenericToolRenderer` for that specific tool call, and log the error.

### Requirement: Slot contributions degrade to no-op when payload is invalid

A plugin contribution that throws during render SHALL NOT crash the shell. The slot consumer SHALL catch the error, log it (including plugin id and slot id), render nothing for that contribution, and continue rendering other contributions in the same slot.

#### Scenario: Plugin component throws

- **WHEN** a plugin's `session-card-badge` component throws on render
- **THEN** the slot consumer SHALL catch the error, log to console with plugin id and slot id, render no badge for that plugin, and other plugins' badges SHALL still render.

#### Scenario: Invalid descriptor for descriptor-renderable slot

- **WHEN** a third-party extension emits a descriptor with a missing required field for `breadcrumb`
- **THEN** the slot consumer SHALL skip the descriptor with a warning and continue.
