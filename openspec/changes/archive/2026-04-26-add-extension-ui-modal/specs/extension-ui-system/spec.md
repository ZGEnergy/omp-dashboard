## ADDED Requirements

### Requirement: Bridge SHALL emit a discovery probe for extension UI modules

The bridge MUST emit `pi.events.emit("ui:list-modules", probe)` where `probe` is `{ modules: ExtensionUiModule[] }` on three triggers: (a) every `session_start` whose `event.reason ∈ {"new","fork","resume"}`, (b) successful WebSocket reconnect after re-registration, (c) any extension-emitted `ui:invalidate` event. After each probe the bridge MUST forward the populated `probe.modules` to the server as a `ui_modules_list` protocol message.

The probe MUST be synchronous: the bridge collects whatever extensions push into `probe.modules` during the `pi.events.emit` call and forwards immediately. The bridge MUST NOT poll, MUST NOT cache module lists across probes, and MUST NOT register modules on the extension's behalf.

#### Scenario: Probe fires on session start
- **WHEN** the bridge processes a `session_start` event with `reason: "new"`
- **THEN** the bridge emits `pi.events.emit("ui:list-modules", probe)` exactly once and forwards a `ui_modules_list` message containing every descriptor pushed by listeners

#### Scenario: Probe re-fires on reconnect
- **WHEN** the bridge's WebSocket connection closes and reconnects successfully
- **AND** session re-registration completes
- **THEN** the bridge emits a fresh `ui:list-modules` probe and forwards an updated `ui_modules_list` containing the current set of modules

#### Scenario: Invalidate triggers re-probe
- **WHEN** an extension emits `pi.events.emit("ui:invalidate", { id: "judo-status" })`
- **THEN** the bridge emits a fresh `ui:list-modules` probe and forwards an updated `ui_modules_list`
- **AND** the optional `id` parameter is recorded for telemetry only — the bridge always re-lists the full module set

#### Scenario: Last-write-wins on duplicate id
- **WHEN** two listeners push descriptors with the same `id` into a single probe
- **THEN** the bridge logs a warning naming the duplicate `id` and forwards only the last-pushed descriptor for that `id`

#### Scenario: No-dashboard fallback
- **WHEN** the bridge has no active dashboard server connection
- **THEN** the bridge does not emit `ui:list-modules` and does not attempt to forward a `ui_modules_list`
- **AND** extension listeners remain dormant; existing slash-command and TUI behavior is unaffected

### Requirement: Module schema SHALL describe Phase-1 view types

The shared package `@blackbelt-technology/pi-dashboard-shared` MUST export `ExtensionUiModule`, `UiView`, `UiField`, `UiAction`, and `UiSection` types. `ExtensionUiModule.kind` MUST equal the literal `"management-modal"` for Phase 1. `UiView.kind` MUST be one of `"table" | "grid" | "form"`. `UiField.kind` MUST be one of `"text" | "number" | "boolean" | "select" | "code" | "datetime" | "textarea"`. `UiAction.icon` and `ExtensionUiModule.icon` MUST refer to keys exported by `@mdi/js`; unknown icon keys MUST render no icon (no error).

`ExtensionUiModule` MUST carry: `kind`, `id`, `command` (exact slash-command string), `title`, and `view`. `command` matching is case-sensitive and exact. Phase 1 does NOT introduce a `namespace` field on the module.

#### Scenario: Table view module is well-formed
- **WHEN** an extension pushes `{ kind: "management-modal", id: "judo-status", command: "/judo:status", title: "Judo Status", view: { kind: "table", fields: [...], dataEvent: "judo:status-rows", rowActions: [...] } }`
- **THEN** the descriptor passes runtime type validation in the shared package
- **AND** the dashboard interprets `view.kind === "table"` and prepares to fetch rows via `view.dataEvent`

#### Scenario: Form view module with sections is well-formed
- **WHEN** an extension pushes a `management-modal` whose `view.kind === "form"` and `view.sections` is a non-empty array of `UiSection` entries
- **THEN** the descriptor passes runtime type validation
- **AND** the dashboard groups fields by section when rendering the form

#### Scenario: Unknown icon name is ignored
- **WHEN** a module declares `icon: "mdiTotallyMadeUpName"` not present in `@mdi/js`
- **THEN** the dashboard renders the module without an icon and emits no error to the user

### Requirement: Wire protocol SHALL include three Phase-1 messages

The protocol MUST add three messages, with identical names on bridge↔server and server↔browser legs:

- `ui_modules_list { sessionId, modules }` — extension → server → browser; cached schemas.
- `ui_data_list { sessionId, event, items }` — extension → server → browser; row data for `table`/`grid` views, keyed by `event` matching some `view.dataEvent`.
- `ui_management { sessionId, action, event, params? }` — browser → server → extension; data fetches use `action: "list"`; user actions use `action: <UiAction.id>`.

All three new browser-bound messages MUST be members of the `ServerToBrowserMessage` union and the new browser-originated message MUST be a member of the `BrowserToServerMessage` union; otherwise esbuild strips them in production.

#### Scenario: Modules list propagates extension → browser
- **WHEN** the bridge sends `ui_modules_list { sessionId: "s1", modules: [m1, m2] }` to the server
- **THEN** the server stores the modules on the Session record
- **AND** the server broadcasts an identical `ui_modules_list` message to every browser subscribed to `s1`

#### Scenario: Browser action triggers extension event
- **WHEN** a subscribed browser sends `ui_management { sessionId: "s1", action: "delete", event: "judo:delete-row", params: { id: 42 } }`
- **THEN** the server forwards the message via `piGateway.sendToSession("s1", msg)`
- **AND** the bridge re-emits it as `pi.events.emit("judo:delete-row", { id: 42, action: "delete", _reply })` for extensions to handle

### Requirement: Server SHALL cache and replay UI module state on subscribe

The server MUST cache `Session.uiModules: ExtensionUiModule[]` and `Session.uiDataMap: Record<string, unknown[]>` on the in-memory Session record. `uiDataMap[event]` MUST cap to the most recent N items (default `N = 1000`); on overflow the cached list is replaced with the most recent message's `items`.

On every `handleSubscribe` call site that currently invokes `replayPendingUiRequests(ws, sessionId)`, the server MUST also invoke an equivalent `replayUiState(ws, sessionId)` immediately after, in this order: events → pending UI requests → UI module state. `replayUiState` MUST send one `ui_modules_list` message containing `session.uiModules` (skipped when empty) and one `ui_data_list` message per `(event, items)` entry in `session.uiDataMap`.

When the session record is removed, the cached `uiModules` and `uiDataMap` MUST be removed with it; no separate cleanup is required.

#### Scenario: Modules list is replayed on subscribe
- **GIVEN** a session `s1` with `session.uiModules = [m1, m2]` cached on the server
- **WHEN** a browser subscribes to `s1`
- **THEN** the server sends a `ui_modules_list { sessionId: "s1", modules: [m1, m2] }` to that browser
- **AND** sends it after the event-replay batches and pending-UI-request replay complete

#### Scenario: Data map is replayed on subscribe
- **GIVEN** a session with `session.uiDataMap = { "judo:status-rows": [r1, r2], "judo:audit": [r3] }`
- **WHEN** a browser subscribes
- **THEN** the server sends a `ui_data_list` message for each event key in `uiDataMap`

#### Scenario: Per-event cap discards oldest data
- **GIVEN** the per-event cap is `N = 1000`
- **WHEN** an extension sends a `ui_data_list` whose `items.length === 1500`
- **THEN** the server caches only the last 1000 entries (or the entire payload if extensions choose to send fewer); never raises an error

### Requirement: Slash-command interception SHALL open the matching modal

The client MUST intercept slash-command input matching exactly some `module.command` in `session.uiModules` and open the matching `GenericExtensionDialog` in place of sending a chat prompt. Matching is case-sensitive, exact (no prefix or substring matches). The intercepted text MUST NOT be forwarded to the extension as a regular prompt and MUST clear from the input field.

If `module.command` collides with a built-in command (e.g. `/model`, `/compact`), the dashboard MUST prefer the built-in and emit a console warning identifying the conflicting module `id`.

#### Scenario: Exact-match command opens the modal
- **GIVEN** `session.uiModules` contains a module with `command: "/judo:status"`
- **WHEN** the user types `/judo:status` and presses Enter in `CommandInput`
- **THEN** `GenericExtensionDialog` opens for that module
- **AND** no `send_prompt` message is sent
- **AND** the input field is cleared

#### Scenario: Built-in command takes precedence
- **GIVEN** an extension registers a module with `command: "/model"`
- **WHEN** the user types `/model`
- **THEN** the dashboard runs the built-in `/model` handler
- **AND** the dashboard emits a console warning naming the conflicting module id

### Requirement: GenericExtensionDialog SHALL render Phase-1 view kinds

The client component `GenericExtensionDialog` MUST render `view.kind ∈ {"table", "grid", "form"}`:

- `table` — header row from `view.fields`, body rows from `session.uiDataMap[view.dataEvent]`, per-row buttons from `view.rowActions`. On mount the component MUST send `ui_management { action: "list", event: view.dataEvent }`.
- `grid` — same data lifecycle as `table` but rendered as a card grid.
- `form` — fields from `view.fields` (or grouped by `view.sections`); top-level `view.actions` are toolbar buttons.

When a `UiAction.confirm` string is set, clicking the action MUST first mount `ConfirmDialog` with that string as the message and the action's label as the confirm-button label; only on confirm does the client send the `ui_management` message. Cancel MUST NOT send the message.

#### Scenario: Table view fetches and renders rows
- **WHEN** `GenericExtensionDialog` opens for a table-view module with `view.dataEvent === "judo:status-rows"`
- **THEN** the component sends `ui_management { action: "list", event: "judo:status-rows" }`
- **AND** when a `ui_data_list` arrives for that event, the table re-renders with the new items

#### Scenario: Action confirmation gates dispatch
- **GIVEN** a row action with `confirm: "Delete this entry?"`
- **WHEN** the user clicks the action
- **THEN** the dashboard mounts `ConfirmDialog` with that message
- **AND** clicking Cancel does not send a `ui_management` message
- **AND** clicking Confirm sends `ui_management { action: <UiAction.id>, event: <UiAction.event>, params: <UiAction.params> }`

### Requirement: Pure-pi behavior SHALL be unchanged

When the bridge is not running, or no dashboard server is connected, extension listeners on `ui:list-modules` MUST remain dormant, `ui:invalidate` MUST be a no-op, slash commands MUST fall back to existing text-output behavior, and `ctx.ui.*` MUST continue to work via `pi-tui` and PromptBus.

#### Scenario: Slash command falls back without a dashboard
- **GIVEN** an extension registers a `ui:list-modules` listener pushing `{ command: "/judo:status", ... }`
- **AND** the pi session is running without a dashboard server
- **WHEN** the user types `/judo:status` in the TUI
- **THEN** the existing slash-command handler runs (text output to the chat) and the new probe-based modal path does nothing
