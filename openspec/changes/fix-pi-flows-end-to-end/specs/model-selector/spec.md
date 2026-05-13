## MODIFIED Requirements

### Requirement: Model selector in status bar

The status bar SHALL display the current model name. Clicking it SHALL open an autocomplete dropdown listing all available models. The model selector component SHALL NOT contain inline roles management UI; roles management SHALL be surfaced exclusively through a `settings-section` plugin contribution (see ADDED Requirements below).

The model selector dropdown MAY still show, in read-only form, a compact "active roles" line (e.g. `@architect → claude-3-7-sonnet, @planner → gpt-4o`) to communicate the current role-to-model map at a glance. Editing, preset save/load, and preset delete actions SHALL live in the settings-section UI, NOT in the dropdown.

The component MAY still receive `roles` as a prop for backward compatibility with callers that drill it through, but the prop SHALL be used only for the optional read-only summary, never for editing controls.

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

#### Scenario: Roles editing controls are not in the dropdown

- **WHEN** the user opens the model dropdown
- **THEN** the rendered dropdown SHALL NOT contain the "Roles" collapse header, preset save/load/delete row, or the editable role grid
- **AND** any read-only roles summary line SHALL be informational only (no buttons, no inputs)

## ADDED Requirements

### Requirement: Roles UI surfaces via settings-section plugin contribution

The dashboard SHALL surface role-to-model assignment, preset save/load, and preset delete through a `settings-section` plugin contribution claimed by a bundled built-in plugin (e.g. `@blackbelt-technology/pi-dashboard-builtins-plugin` or registered inside an existing bundled package). The claim SHALL target `tab: "general"` (default) so users find it next to other general settings.

The contribution SHALL receive the same `RoleInfo` data flow that exists today (server forwards `roles_list` over WebSocket; client `useMessageHandler` populates `rolesMap[sessionId]`), accessed via the plugin context's typed state rather than prop drilling.

The contribution SHALL expose the same actions as today's inlined UI: per-role model assignment, preset list (load / save with name / delete), and an active-preset indicator.

#### Scenario: Roles section appears in the General settings tab

- **WHEN** the user opens Settings and views the General tab
- **THEN** a "Roles" section SHALL render among the bundled general-tab contributions
- **AND** it SHALL list every currently configured role with its assigned model id
- **AND** it SHALL list every saved preset with load + delete affordances and a "Save current as preset…" control

#### Scenario: No regression when pi-flows is not installed

- **WHEN** pi-flows is not installed and the session reports no `RoleInfo`
- **THEN** the Roles settings-section SHALL render an empty-state hint ("No roles configured. Install pi-flows to assign per-role models.") and SHALL NOT throw

#### Scenario: Edits round-trip through existing role protocol

- **WHEN** the user changes `@architect`'s model in the settings UI
- **THEN** the contribution SHALL dispatch the same `role_set` WebSocket message that today's inline UI dispatches, hitting the same bridge handler and pi-flows event listener (no protocol change required)

#### Scenario: Third-party plugin can contribute additional roles UI

- **WHEN** a third-party plugin claims `{ slot: "settings-section", tab: "general", component: "MyRolesUi" }`
- **THEN** both the built-in roles section and the third-party contribution render in the General tab in priority order
