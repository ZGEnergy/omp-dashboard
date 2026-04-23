## ADDED Requirements

### Requirement: Server exposes POST /api/providers/test

The dashboard server SHALL expose `POST /api/providers/test` behind the localhost/auth network guard. The endpoint accepts `{ name?: string, baseUrl: string, apiKey: string, api: string }` and performs a live HTTP probe against the provider using the per-API-type request shape, returning a structured pass/fail result.

#### Scenario: openai-completions probe succeeds
- **WHEN** the endpoint receives `{ baseUrl: "https://api.example.com/v1", apiKey: "sk-abc", api: "openai-completions" }`
- **AND** `GET https://api.example.com/v1/models` with header `Authorization: Bearer sk-abc` returns HTTP 200 with a body `{ data: [ { id: "m1" }, { id: "m2" }, ... ] }`
- **THEN** the response SHALL be `{ ok: true, status: 200, modelCount: 2, sample: ["m1", "m2"] }` (sample limited to the first 5 ids)

#### Scenario: anthropic-messages probe uses x-api-key header
- **WHEN** `api` is `anthropic-messages`
- **THEN** the probe SHALL issue `GET {baseUrl}/v1/models` with headers `x-api-key: <apiKey>` and `anthropic-version: 2023-06-01`
- **AND** SHALL NOT include an `Authorization: Bearer` header

#### Scenario: google-generative-ai probe uses key query param
- **WHEN** `api` is `google-generative-ai`
- **THEN** the probe SHALL issue `GET {baseUrl}/models?key=<urlEncodedApiKey>` with no Authorization header

#### Scenario: Provider returns 401
- **WHEN** the upstream provider returns HTTP 401
- **THEN** the response SHALL be `{ ok: false, status: 401, error: "<excerpt of response body, truncated to 500 chars>" }`

#### Scenario: Provider returns non-2xx non-auth error
- **WHEN** the upstream returns HTTP 404, 500, or any other non-2xx status
- **THEN** the response SHALL be `{ ok: false, status: <status>, error: "<body excerpt>" }`

#### Scenario: Network error or timeout
- **WHEN** the fetch fails with a network error (DNS, TCP refused) OR the probe exceeds the 8-second timeout
- **THEN** the response SHALL be `{ ok: false, error: "<error message>" }` with no `status` field
- **AND** the server process SHALL NOT crash or leak the AbortController

#### Scenario: apiKey value is a $ENV_VAR reference
- **WHEN** the submitted `apiKey` is `"$MY_LLM_KEY"` and `process.env.MY_LLM_KEY` is set
- **THEN** the probe SHALL resolve the env var and use its value in the upstream request
- **WHEN** the env var is unset
- **THEN** the response SHALL be `{ ok: false, error: "Environment variable MY_LLM_KEY is not set" }` with no upstream request issued

#### Scenario: apiKey value is the REDACTED sentinel
- **WHEN** the submitted `apiKey` is `"***"` AND a `name` field is provided AND `~/.pi/agent/providers.json` contains an entry for that name
- **THEN** the server SHALL read the live `apiKey` from the file for that provider name and use it for the probe (never including it in the response)
- **WHEN** `apiKey` is `"***"` AND no matching entry exists in providers.json
- **THEN** the response SHALL be `{ ok: false, error: "No saved API key for provider \"<name>\"" }`

#### Scenario: Response never echoes the apiKey
- **WHEN** the endpoint returns any response (success or failure)
- **THEN** the response body SHALL NOT contain the raw `apiKey` value, the `Authorization` header, or any resolved env var value

#### Scenario: Endpoint rejects non-local unauthenticated requests
- **WHEN** the request arrives from a non-loopback, non-bypassed, non-authenticated origin
- **THEN** the network guard SHALL reject the request before any upstream probe is issued

### Requirement: Test button on Add Provider card

The Settings \u2192 Providers \u2192 LLM Providers \u2192 **Add Provider** card SHALL display a **Test** button next to the Remove button. Clicking it SHALL invoke `POST /api/providers/test` with the card's current unsaved values and display an inline status pill beneath the form.

#### Scenario: Test button enabled state
- **WHEN** both `baseUrl` and `apiKey` fields are non-empty
- **THEN** the Test button SHALL be enabled

#### Scenario: Test button disabled state
- **WHEN** either `baseUrl` or `apiKey` is empty
- **THEN** the Test button SHALL be disabled and SHALL show a tooltip `"Enter Base URL and API Key first"`

#### Scenario: Testing in progress
- **WHEN** the user clicks Test
- **THEN** the button SHALL switch to a disabled loading state with a spinner and label `"Testing\u2026"`
- **AND** the card SHALL display an inline status pill with text `"Testing\u2026"`

#### Scenario: Test succeeds
- **WHEN** the server responds with `{ ok: true, modelCount: N, sample: [...] }`
- **THEN** the status pill SHALL show a green check with text `"Connected \u00b7 N models"` (or `"Connected"` when `modelCount` is 0 or missing)
- **AND** the pill SHALL persist until the user edits any field (baseUrl / apiKey / api), at which point the pill is cleared

#### Scenario: Test fails with HTTP status
- **WHEN** the server responds with `{ ok: false, status: 401, error: "..." }`
- **THEN** the status pill SHALL show a red cross with text `"401 \u2014 <first line of error>"`

#### Scenario: Test fails with network error
- **WHEN** the server responds with `{ ok: false, error: "fetch failed: ECONNREFUSED" }` (no `status`)
- **THEN** the status pill SHALL show a red cross with text `"<error>"` (truncated to one line)

#### Scenario: Test works for already-saved providers
- **WHEN** the user clicks Test on a non-new card (apiKey field shows the `***` placeholder)
- **THEN** the client SHALL send `{ name, baseUrl, apiKey: "***", api }` to the endpoint
- **AND** the server SHALL resolve the real key from `providers.json` and probe upstream
- **AND** the client SHALL show the resulting success/failure pill

#### Scenario: Save is independent of Test
- **WHEN** the user clicks Test
- **THEN** the client SHALL NOT call `PUT /api/providers`
- **AND** the card's dirty/save state SHALL be unchanged regardless of Test outcome
