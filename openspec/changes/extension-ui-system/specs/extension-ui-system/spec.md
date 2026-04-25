## ADDED Requirements

### Requirement: Pull-based discovery probe

The bridge SHALL emit a `ui:list-modules` event on `pi.events` after `session_start`, after every successful WebSocket reconnect, and after receiving an `ui:invalidate` event from any extension. The probe payload SHALL be a plain object containing a `modules: ExtensionUiModule[]` array initialized to empty. Extensions SHALL register synchronous listeners that push their schema descriptors into `data.modules`. After all listeners have run, the bridge SHALL forward the populated array as a `ui_modules_list` protocol message.

#### Scenario: Initial probe on session start

- **WHEN** `session_start` fires for a session
- **THEN** the bridge SHALL emit `ui:list-modules` once and forward the resulting `ui_modules_list` message to the server before any other extension UI traffic.

#### Scenario: Reprobe on invalidate

- **WHEN** any extension emits `pi.events.emit("ui:invalidate", { id })`
- **THEN** the bridge SHALL re-emit `ui:list-modules` and forward an updated `ui_modules_list` message.

#### Scenario: Probe object is mutable

- **WHEN** the bridge emits `ui:list-modules` with a probe object
- **THEN** extension listeners SHALL push their descriptors into `data.modules` synchronously, and the bridge SHALL read the populated array on the same event-loop tick.

#### Scenario: No-dashboard fallback is a no-op

- **WHEN** no bridge connection exists (no dashboard server reachable)
- **THEN** `ui:list-modules` SHALL NOT be emitted, extension listeners SHALL remain dormant, and no protocol traffic SHALL be produced.

### Requirement: Module schema for management-modal kind

A `management-modal` module descriptor SHALL conform to the `ExtensionUiModule` shape defined in `@blackbelt-technology/pi-dashboard-shared/types.js`:

```ts
interface ExtensionUiModule {
  kind: "management-modal";
  id: string;
  title: string;
  icon?: string;            // MDI icon name (camelCase, e.g. "cogOutline")
  command: string;          // Slash command (including "/") that triggers this UI
  views: UiView[];
  initialViewId: string;
}
```

Each `UiView` SHALL be of `type: "table" | "grid" | "form"` with `fields`, `actions`, and (for table/grid) `itemActions` arrays. Field types are constrained to `"text" | "number" | "boolean" | "select" | "code" | "datetime" | "textarea"`.

#### Scenario: Module declares a slash command

- **WHEN** a module pushes a descriptor with `command: "/my-cmd"`
- **THEN** the dashboard SHALL intercept user input matching that exact slash command and open the modal instead of forwarding the text to the agent.

#### Scenario: Modal opens to initial view

- **WHEN** a user triggers a module via its slash command
- **THEN** the dashboard SHALL render the view whose `id` matches `initialViewId`.

#### Scenario: Unknown view type is rejected at registration

- **WHEN** an extension pushes a `UiView` with `type` not in the enum
- **THEN** the bridge SHALL log a warning and skip that view; the module is otherwise valid.

### Requirement: Data fetching protocol

For each `UiView` of type `table` or `grid` with a `dataEvent` field, the bridge SHALL emit a `ui:get-data` probe with `{ event: dataEvent, action: "list" }` immediately after `ui_modules_list` is sent and on every browser-initiated refresh. Extensions SHALL listen and populate `data.items` synchronously. The bridge SHALL forward populated items as `ui_data_list { sessionId, event, items }`.

#### Scenario: Initial data fetched proactively on registration

- **WHEN** the bridge sends `ui_modules_list` containing a view with `dataEvent: "judo:list-models"`
- **THEN** the bridge SHALL immediately emit `ui:get-data` for that event and forward `ui_data_list` if items are populated.

#### Scenario: Refresh on browser request

- **WHEN** the browser sends `ui_management { action: "list", event: "judo:list-models" }`
- **THEN** the bridge SHALL emit `ui:get-data` with the same parameters and forward the resulting items as `ui_data_list`.

#### Scenario: Empty items is valid

- **WHEN** an extension's `ui:get-data` listener leaves `data.items` undefined or empty
- **THEN** the bridge SHALL send `ui_data_list` with an empty array; the dashboard SHALL render an "empty state."

### Requirement: Action dispatch protocol

User interactions in the modal SHALL be dispatched via `ui_management { sessionId, action, event, params? }`. The server SHALL forward unchanged to the bridge, which SHALL emit `pi.events.emit(event, { ...params, action })`. Extensions handle these as normal `pi.events` listeners.

The reserved `event: "ui:navigate"` SHALL NOT reach extensions; the dashboard handles it client-side to switch views within the same modal.

#### Scenario: Action button click

- **WHEN** the user clicks an action with `emit: "judo:save-model"` and `params: { modelId: "x" }`
- **THEN** the dashboard sends `ui_management { action: "submit", event: "judo:save-model", params: { modelId: "x" } }`, the bridge emits `pi.events.emit("judo:save-model", { modelId: "x", action: "submit" })`, and the extension's listener handles it.

#### Scenario: Internal navigation does not reach extension

- **WHEN** an action has `emit: "ui:navigate"` with `params: { viewId: "form" }`
- **THEN** the dashboard SHALL switch the active view client-side and SHALL NOT send any `ui_management` message.

#### Scenario: Confirmation prompt before action

- **WHEN** an action has a `confirm: "Delete?"` field
- **THEN** the dashboard SHALL display a confirmation dialog and only send `ui_management` if the user confirms.

### Requirement: Module schema for live-decoration kinds

Live decoration descriptors SHALL conform to the discriminated union below and SHALL be forwarded as `ext_ui_decorator` messages:

```ts
type DecoratorDescriptor =
  | { kind: "footer-segment",   namespace, id, text: string, tone?: Tone }
  | { kind: "agent-metric",     namespace, id, agentId: string, line: string, tone?: Tone }
  | { kind: "breadcrumb",       namespace, id, steps: BreadcrumbStep[], current: number }
  | { kind: "gate",             namespace, id, flowId: string, available: boolean, reason?: string }
  | { kind: "toast",            namespace, id, level: "info"|"success"|"warn"|"danger", message: string }
  | { kind: "settings-section", namespace, id, title: string, icon?: string,
      // Phase 1 default: simple UiField-driven form
      fields?: UiField[],
      // Phase 4: JSON Schema escape hatch (mutually exclusive with `fields`)
      schema?: JSONSchema7,
      uiSchema?: Record<string, unknown> };

type Tone = "info" | "success" | "warn" | "danger" | "muted";
type BreadcrumbStep = { id: string, label: string, state: "done"|"current"|"pending" };
```

The `text`, `line`, and other render-output strings SHALL be plain text (no HTML, no Markdown). The dashboard SHALL render them with a fixed visual treatment per kind.

#### Scenario: Footer segment text update

- **WHEN** an extension pushes `{ kind: "footer-segment", namespace: "judo", id: "model-state", text: "3 mut", tone: "info" }`
- **THEN** the dashboard SHALL render the text in the session header's footer-segment slot with the info tone color.

#### Scenario: Agent metric attaches to specific agent

- **WHEN** an extension pushes `{ kind: "agent-metric", agentId: "step-3", line: "query:5 │ mut:2", ... }`
- **THEN** the dashboard SHALL render the line under the `FlowAgentCard` whose `agentId` matches `step-3`. If no such card exists, the descriptor is cached and rendered when the card appears.

#### Scenario: Settings-section descriptor renders in Settings page

- **WHEN** an extension pushes `{ kind: "settings-section", namespace: "judo", id: "main", title: "Judo", fields: [{ key: "endpoint", label: "Endpoint", type: "text" }] }`
- **THEN** the dashboard SHALL render a section titled "Judo" in the Settings page with a text input for `endpoint`. On save, the value SHALL persist to `~/.pi/dashboard/config.json` under `plugins.judo.endpoint`.

#### Scenario: Settings-section persistence reaches extension

- **WHEN** the user saves a settings-section form
- **THEN** the dashboard SHALL POST `/api/config/plugins/<namespace>` with the form values; on success, the server SHALL broadcast `plugin_config_update`, and the extension MAY listen for `pi.events.emit("ui:config-changed", { namespace, config })` to react.

#### Scenario: Decorator removal

- **WHEN** an extension pushes a descriptor with `removed: true`
- **THEN** the server SHALL delete the cached entry for `(sessionId, kind, namespace, id)` and the dashboard SHALL remove the rendered element.

### Requirement: Server-side replay cache

The dashboard server SHALL cache:

- The latest `ui_modules_list` per `sessionId`.
- The latest `ext_ui_decorator` per `(sessionId, kind, namespace, id)`.

On browser subscribe, the server SHALL replay both caches before any live messages. On `session_end`, the server SHALL clear both caches for that session. On `removed: true` decorator, the server SHALL delete the cache entry and forward the deletion to all subscribers.

#### Scenario: Replay on reconnect

- **WHEN** a browser subscribes to a session that already has registered modules and decorators
- **THEN** the server SHALL send the cached `ui_modules_list` and all cached `ext_ui_decorator` messages before forwarding live traffic.

#### Scenario: Cache cleared on session end

- **WHEN** `session_end` fires for a session
- **THEN** the server SHALL delete all cached UI state for that session.

#### Scenario: Removal forwarded

- **WHEN** an extension pushes a decorator with `removed: true`
- **THEN** the server SHALL forward the removal to all subscribed browsers and delete its cache entry.

### Requirement: Namespace collision handling

Each module and decorator descriptor SHALL include a `namespace` field (Phase 2 onwards; Phase 1 modules MAY rely on `id` alone with the bridge logging a deprecation warning).

When two descriptors share `(namespace, id)` within a single probe, the bridge SHALL log a warning of the form `extension-ui: collision on namespace="<ns>" id="<id>", last-write-wins` and apply last-write-wins semantics. Cross-namespace collision on `id` alone SHALL NOT be a warning.

#### Scenario: Same-namespace collision

- **WHEN** two listeners push `{ namespace: "judo", id: "model-state" }` in the same probe
- **THEN** the bridge SHALL log a warning, retain only the last descriptor, and forward exactly one descriptor for that key.

#### Scenario: Cross-namespace same id is allowed

- **WHEN** two listeners push descriptors with the same `id: "status"` but different `namespace`s
- **THEN** both descriptors SHALL be retained and forwarded independently.

### Requirement: Slash command interception

The dashboard client SHALL intercept user-typed slash commands and match them against `ExtensionUiModule.command` exact strings. On match, the modal SHALL open and the typed text SHALL NOT be forwarded as a chat message.

If a typed slash command does not match any registered module, behavior is unchanged: the command is treated as a normal slash command via the existing autocomplete and command-routing path.

#### Scenario: Matching command opens modal

- **WHEN** a user types `/judo:status` and a module registers `command: "/judo:status"`
- **THEN** the modal SHALL open and the text SHALL NOT appear in the chat.

#### Scenario: Non-matching command falls through

- **WHEN** a user types `/compact` and no module registers that command
- **THEN** the text SHALL be processed by the existing slash-command path unchanged.
