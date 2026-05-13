## ADDED Requirements

### Requirement: Model selector in status bar
The status bar SHALL display the current model name. Clicking it SHALL open an autocomplete dropdown listing all available models.

#### Scenario: Display current model
- **WHEN** a session has a model selected (e.g., "anthropic/claude-4")
- **THEN** the status bar shows the model name on the left side

#### Scenario: Open model dropdown
- **WHEN** user clicks the model name
- **THEN** a dropdown appears with a text filter and scrollable list of available models

#### Scenario: Filter models
- **WHEN** user types in the filter input
- **THEN** the list filters to models matching the query (provider or id)

#### Scenario: Select model
- **WHEN** user clicks a model in the dropdown
- **THEN** a `set_model` message SHALL be sent with `{ provider, modelId }` extracted from the selected model string
- **AND** the dropdown closes
- **AND** the selector SHALL display the selected model name with a pending indicator (⏳)

#### Scenario: Pending model indicator clears on confirmation
- **WHEN** the server confirms the model change via `session_updated` or `model_select` event
- **THEN** the pending indicator SHALL be removed and the selector SHALL show the confirmed model name

#### Scenario: Pending model indicator timeout
- **WHEN** no model confirmation is received within 10 seconds
- **THEN** the pending indicator SHALL be removed and the selector SHALL revert to showing the current model

#### Scenario: No models available
- **WHEN** no models list has been received from the extension
- **THEN** the model name is shown as plain text (not clickable)

### Requirement: Status bar always visible
The status bar SHALL be always visible between ChatView and CommandInput, replacing the WorkingIndicator which only appeared during streaming.

#### Scenario: Idle state
- **WHEN** the session is idle
- **THEN** the status bar shows the model selector on the left, right side is empty

#### Scenario: Streaming state
- **WHEN** the session is streaming
- **THEN** the status bar shows the model selector on the left and working status on the right

### Requirement: Thinking level selector
The status bar SHALL include a thinking level selector next to the model selector. Clicking it SHALL open a dropdown with available thinking levels.

Available levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

#### Scenario: Display current thinking level
- **WHEN** a session has a thinking level set
- **THEN** the status bar shows the current level

#### Scenario: Change thinking level
- **WHEN** user selects a different level from the dropdown
- **THEN** a `set_thinking_level` message SHALL be sent to the server, which forwards it to the bridge extension

#### Scenario: Bridge applies thinking level
- **WHEN** the bridge receives a `set_thinking_level` message
- **THEN** it SHALL call `pi.setThinkingLevel(level)` and send a `model_update` message back with the new level

### Requirement: Models list from extension
The extension SHALL send a `models_list` message on session_start with all available models from `modelRegistry.getAvailable()`.

#### Scenario: Models sent on session start
- **WHEN** a pi session starts
- **THEN** the extension sends `models_list` with available models

#### Scenario: Browser requests models refresh
- **WHEN** the browser sends `request_models`
- **THEN** the extension responds with `models_list`

### Requirement: Multi-token AND search
The model filter input SHALL support space-separated search tokens. Each token MUST match somewhere in the combined `provider/modelId` string. ALL tokens MUST match for a model to appear in results (AND logic).

#### Scenario: Single token search
- **WHEN** the user types "claude" in the model filter
- **THEN** all models containing "claude" in their provider or model ID are shown

#### Scenario: Multi-token AND search
- **WHEN** the user types "anthropic opus" in the model filter
- **THEN** only models where BOTH "anthropic" AND "opus" appear in `provider/id` are shown

#### Scenario: Empty filter shows all models
- **WHEN** the filter input is empty
- **THEN** all models are displayed (filtered only by provider dropdown if set)

### Requirement: Provider filter dropdown
The model selector SHALL include a provider filter dropdown above or beside the text filter input. The dropdown SHALL list "All Providers" as the default option followed by all unique provider names extracted from the available models. When a provider is selected, only models from that provider SHALL be shown in the list (before text filter is applied).

#### Scenario: Default shows all providers
- **WHEN** the model selector opens
- **THEN** the provider dropdown shows "All Providers" selected
- **AND** models from all providers are listed

#### Scenario: Filtering by provider
- **WHEN** the user selects "anthropic" from the provider dropdown
- **THEN** only models with `provider === "anthropic"` are shown
- **AND** the text filter still applies within the filtered set

#### Scenario: Combined provider and text filter
- **WHEN** the user selects "openai" from the provider dropdown and types "gpt" in the filter
- **THEN** only openai models containing "gpt" are shown


### Requirement: Thinking level updates propagate to both UI surfaces

When the bridge sends a `model_update` message (via `modelTracker.sendModelUpdateIfChanged` after `set_thinking_level`), the server SHALL patch both the `DashboardSession` registry (observed by session cards and the session header) AND the browser-side `sessionStates[sessionId]` state (observed by the bottom StatusBar selector), so the thinking level displayed in every UI surface stays consistent.

Protocol-level responsibility: the server's `model_update` handler in `event-wiring.ts` continues to update `sessionManager` and broadcast `session_updated`. The client's `session_updated` handler in `useMessageHandler.ts` SHALL, in addition to patching the `sessions` Map, mirror `thinkingLevel` and `model` fields from `msg.updates` into `sessionStates[msg.sessionId]` (creating a fresh `SessionState` via `createInitialState()` when the session has no state yet).

Rationale: the StatusBar component reads `selectedState.thinkingLevel ?? selectedSession?.thinkingLevel`, preferring event-reducer state over the DashboardSession. Without the mirror, the server-pushed thinking level updates `sessions[id].thinkingLevel` but not `sessionStates[id].thinkingLevel`, causing the StatusBar to silently fall back to a stale value while the SessionCard refreshes correctly.

Only `thinkingLevel` and `model` are mirrored; other `DashboardSession`-only fields (`name`, `cost`, `contextTokens`, `contextWindow`, etc.) stay unmirrored because no event-reducer-driven UI surface reads them.

#### Scenario: StatusBar and SessionCard update together when user clicks a thinking level

- **WHEN** the user clicks `medium` in the bottom StatusBar's thinking level dropdown on a session that previously displayed `off`
- **AND** the bridge receives `set_thinking_level`, calls `pi.setThinkingLevel("medium")`, and sends `model_update` with `thinkingLevel: "medium"` back to the server
- **AND** the server patches `DashboardSession.thinkingLevel = "medium"` and broadcasts `session_updated`
- **THEN** the client's `session_updated` handler SHALL update both `sessions[sessionId].thinkingLevel` AND `sessionStates[sessionId].thinkingLevel` to `"medium"`
- **AND** the SessionCard's `{session.thinkingLevel}` text SHALL read `medium`
- **AND** the StatusBar's `ThinkingLevelSelector.current` prop (fed by `selectedState.thinkingLevel`) SHALL also read `medium`
- **AND** neither surface SHALL revert after the round-trip settles

#### Scenario: Model change propagates to both surfaces

- **WHEN** the user selects a different model from the StatusBar ModelSelector
- **AND** the server broadcasts `session_updated` with `updates: { model: "proxy/cc/claude-opus-4-7" }`
- **THEN** both `sessions[sessionId].model` AND `sessionStates[sessionId].model` SHALL be updated
- **AND** the SessionCard's model label AND the StatusBar's ModelSelector current value SHALL both reflect the new selection

#### Scenario: Non-model/non-thinkingLevel session updates do not disturb sessionStates

- **WHEN** the server broadcasts `session_updated` with `updates: { name: "new session name" }` (no `model` / `thinkingLevel`)
- **THEN** the client SHALL update `sessions[sessionId].name` only
- **AND** `sessionStates[sessionId]` SHALL remain unchanged (no spurious `createInitialState()` allocation, no accidental reset of `messages` / `status` / `contextUsage`)

#### Scenario: Mirror creates initial state when session has no prior state

- **WHEN** `session_updated` arrives for a sessionId that has no entry in `sessionStates` yet
- **AND** the update includes `thinkingLevel` or `model`
- **THEN** the client SHALL call `createInitialState()` to seed the state map before applying the mirror
- **AND** the other `SessionState` fields (`messages`, `status`, `events`, …) SHALL be set to their initial empty values

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
