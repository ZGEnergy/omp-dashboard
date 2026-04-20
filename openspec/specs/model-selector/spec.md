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

### Requirement: Models list from extension
The extension SHALL send a `models_list` message on session_start with all available models from `modelRegistry.getAvailable()`.

#### Scenario: Models sent on session start
- **WHEN** a pi session starts
- **THEN** the extension sends `models_list` with available models

#### Scenario: Browser requests models refresh
- **WHEN** the browser sends `request_models`
- **THEN** the extension responds with `models_list`
