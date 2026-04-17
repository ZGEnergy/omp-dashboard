## MODIFIED Requirements

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
