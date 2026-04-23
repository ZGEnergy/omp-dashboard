## ADDED Requirements

### Requirement: Custom-provider models default to image-capable

When the bridge extension registers a custom provider via `pi.registerProvider(...)` in `registerEntry()` (packages/extension/src/provider-register.ts), every model synthesized from the upstream `/v1/models` discovery response SHALL be declared with `input: ["text", "image"]` as its default capability. This default SHALL apply uniformly regardless of the model id, the provider's `api` field, or any upstream metadata. The default SHALL NOT apply to built-in or OAuth providers whose capabilities come from pi-ai's bundled `models.generated.js`.

#### Scenario: Default capability on fresh provider registration
- **WHEN** `registerEntry()` discovers a model from the upstream `/v1/models` endpoint
- **AND** the provider entry in `providers.json` does not explicitly override the model's capabilities
- **THEN** the synthesized model descriptor passed to `pi.registerProvider(...)` SHALL have `input: ["text", "image"]`

#### Scenario: Image-bearing prompt reaches vision-capable custom-provider model
- **WHEN** a user submits a prompt containing an image targeting a custom-provider model registered with `input: ["text", "image"]`
- **THEN** pi-ai's `downgradeUnsupportedImages` in `providers/transform-messages.js` SHALL NOT replace the image with the `"(image omitted: model does not support images)"` placeholder
- **AND** the image block SHALL be serialized into the outbound HTTP request by the provider-specific serializer (`openai-completions`, `anthropic-messages`, or `google-generative-ai`)

#### Scenario: Image-bearing prompt to text-only custom-provider model — graceful upstream handling
- **WHEN** a user submits a prompt containing an image targeting a custom-provider model that does not actually support vision
- **AND** the upstream returns HTTP 200 (silently ignoring the image or acknowledging its absence in the reply text)
- **THEN** the dashboard SHALL surface the model's response verbatim without injecting a client-side placeholder
- **AND** the turn SHALL complete normally

#### Scenario: Image-bearing prompt to text-only custom-provider model — hard upstream rejection
- **WHEN** a user submits a prompt containing an image targeting a custom-provider model that does not actually support vision
- **AND** the upstream returns HTTP 400 rejecting the image payload
- **THEN** the dashboard SHALL surface the upstream error message verbatim through the existing error-display path
- **AND** the turn SHALL end with an error status

#### Scenario: Built-in / OAuth providers unchanged
- **WHEN** pi loads a built-in or OAuth-authenticated provider (Anthropic, OpenAI Codex, GitHub Copilot, Gemini CLI, Antigravity)
- **THEN** the provider's models SHALL retain their `input` capability from pi-ai's `models.generated.js`
- **AND** this change SHALL NOT alter the capability of any built-in model
