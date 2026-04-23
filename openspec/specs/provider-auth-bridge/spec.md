## ADDED Requirements

### Requirement: Credentials updated protocol message
The shared protocol SHALL define a `credentials_updated` message type in the `ServerToExtensionMessage` union. The message SHALL contain `{ type: "credentials_updated" }` with no additional payload.

#### Scenario: Message type definition
- **WHEN** the protocol types are compiled
- **THEN** `CredentialsUpdatedMessage` SHALL be a valid `ServerToExtensionMessage` variant with `type: "credentials_updated"`

### Requirement: Bridge handles credentials_updated
When the bridge extension receives a `credentials_updated` message from the server, it SHALL call `authStorage.reload()` on the cached `modelRegistry.authStorage` to force pi to re-read `auth.json` from disk.

#### Scenario: Credential reload on notification
- **WHEN** the bridge receives `{ type: "credentials_updated" }` and `modelRegistry.authStorage` is available
- **THEN** the bridge SHALL call `authStorage.reload()` so the pi session picks up updated credentials

#### Scenario: No modelRegistry available
- **WHEN** the bridge receives `credentials_updated` but `modelRegistry` has not been captured yet (session not started)
- **THEN** the bridge SHALL ignore the message without error

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



### Requirement: Bridge hot-reloads providers.json on credentials_updated
When the bridge extension receives a `credentials_updated` message, it SHALL re-read `~/.pi/agent/providers.json`, diff it against the last-registered provider snapshot, and call `pi.registerProvider(...)` for new or changed entries and `pi.unregisterProvider(...)` for removed entries — BEFORE invoking `modelRegistry.refresh()`. This ensures the model registry's subsequent refresh observes the newly-registered providers.

#### Scenario: New provider added to providers.json
- **WHEN** a new `{ name, baseUrl, apiKey, api }` entry is added to `~/.pi/agent/providers.json`
- **AND** the server broadcasts `{ type: "credentials_updated" }`
- **THEN** the bridge SHALL call `pi.registerProvider(name, ...)` with models discovered from the provider's `/v1/models` endpoint (or an empty models list if discovery fails)
- **AND** the subsequent `modelRegistry.refresh()` SHALL include the new provider's models in `getAvailable()`

#### Scenario: Existing provider removed from providers.json
- **WHEN** an existing entry is removed from `~/.pi/agent/providers.json`
- **AND** the server broadcasts `{ type: "credentials_updated" }`
- **THEN** the bridge SHALL call `pi.unregisterProvider(name)` for the removed entry
- **AND** that provider's models SHALL NOT appear in `modelRegistry.getAvailable()` after refresh

#### Scenario: Existing provider edited in providers.json
- **WHEN** an existing entry's `baseUrl`, `apiKey`, or `api` field changes in `~/.pi/agent/providers.json`
- **AND** the server broadcasts `{ type: "credentials_updated" }`
- **THEN** the bridge SHALL call `pi.unregisterProvider(name)` then `pi.registerProvider(name, ...)` with the new configuration
- **AND** async model discovery SHALL use the new `baseUrl` / `apiKey`

#### Scenario: Async model discovery completes after registration
- **WHEN** `pi.registerProvider(...)` is called during hot-reload
- **AND** the provider's async `/v1/models` discovery completes
- **THEN** the existing `onProviderChanged` callback SHALL fire
- **AND** the bridge SHALL send an updated `models_list` message for the current session so the dashboard browser client refreshes its model selector

#### Scenario: providers.json unchanged between credentials_updated events
- **WHEN** `credentials_updated` is received
- **AND** `~/.pi/agent/providers.json` has not changed since the last hot-reload
- **THEN** the bridge SHALL NOT call `pi.registerProvider` or `pi.unregisterProvider` for any entry
- **AND** `modelRegistry.refresh()` SHALL still be invoked to handle non-provider credential changes (e.g. OAuth)

#### Scenario: providers.json read fails
- **WHEN** reading `~/.pi/agent/providers.json` throws (missing file, parse error, IO error)
- **THEN** the bridge SHALL log the error via `console.error` with a `[dashboard]` prefix
- **AND** SHALL still invoke `modelRegistry.refresh()` so other credential updates are not blocked


