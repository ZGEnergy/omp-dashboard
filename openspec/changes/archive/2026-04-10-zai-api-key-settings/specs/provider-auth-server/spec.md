## MODIFIED Requirements

### Requirement: API key provider registry
The server SHALL maintain an `API_KEY_PROVIDERS` array of API key provider definitions. Each entry SHALL have `id`, `authJsonKey`, and `name`. The registry SHALL include: `anthropic-api`, `openai`, `google`, `mistral`, `groq`, `xai`, `openrouter`, and `zai`.

#### Scenario: Z.ai provider appears in status
- **WHEN** a client requests `GET /api/provider-auth/status`
- **THEN** the response SHALL include an entry with `id: "zai"`, `name: "Z.ai"`, `flowType: "api_key"`

#### Scenario: Z.ai provider with saved key
- **WHEN** `auth.json` contains `{ "zai": { "type": "api_key", "key": "zai-testkey123abc" } }`
- **AND** a client requests `GET /api/provider-auth/status`
- **THEN** the `zai` entry SHALL have `authenticated: true` and a `maskedKey` value

### Requirement: API key masking format
When displaying a saved API key in the status response, the server SHALL mask the key by showing the first 5 characters, followed by `...`, followed by the last 3 characters. For keys shorter than 12 characters, the server SHALL return `****` instead.

#### Scenario: Mask a standard-length key
- **WHEN** a provider has a saved key `sk-abc123xyz789`
- **THEN** `maskedKey` SHALL be `sk-ab...789`

#### Scenario: Mask a short key
- **WHEN** a provider has a saved key `shortkey` (8 chars, under 12)
- **THEN** `maskedKey` SHALL be `****`

#### Scenario: Mask an empty key
- **WHEN** a provider has a saved key that is an empty string
- **THEN** the provider SHALL have `authenticated: false` and no `maskedKey`
