## ADDED Requirements

### Requirement: Auto-recovery from revoked integrated-proxy key

The Honcho self-host lifecycle SHALL detect a revoked auto-minted
`pi-proxy-*` key on every `runAutoStart` and `/server/start` invocation,
and re-mint a replacement before the docker stack reaches the LLM call.

Detection is gated on `selfHost.llm._autoKeyId` being set: if absent, the
config is treated as user-owned and left alone.

#### Scenario: Auto-key still valid → no-op

- **GIVEN** `selfHost.llm.source = "openai-compatible"`, `apiKey` starts
  with `pi-proxy-`, `_autoKeyId` is set, and `GET /v1/models` with the
  current `apiKey` returns `200`
- **WHEN** lifecycle runs `runAutoStart` or `/server/start`
- **THEN** no re-mint occurs and `selfHost.llm` is unchanged

#### Scenario: Auto-key revoked → silent re-mint

- **GIVEN** `_autoKeyId` is set, the listed key with that id has label
  `honcho-auto`, and `GET /v1/models` returns `401` or `403`
- **WHEN** lifecycle runs
- **THEN** the system mints a new `pi-proxy-*` key labelled `honcho-auto`
- **AND** writes the new `apiKey`, `_autoKeyId`, and (if changed) `model`
  into `~/.honcho/config.json`
- **AND** best-effort revokes the prior key via
  `POST /api/model-proxy/api-keys/:id/revoke`
- **AND** broadcasts `plugin:honcho:status` with `lastEvent: "auto-remint"`
- **AND** triggers `regenerateComposeForChanges` so the next `composeUp`
  picks up the new env block

#### Scenario: Probe times out or returns 5xx → leave config alone

- **GIVEN** `_autoKeyId` is set
- **WHEN** `GET /v1/models` returns a network error, timeout, or status
  outside `{401, 403}`
- **THEN** no re-mint occurs and the existing `lastError` from
  `pollHealth` surfaces normally

#### Scenario: User replaced auto-key with their own → no re-mint

- **GIVEN** `_autoKeyId` is set, but the listed key with that id is
  missing OR has a label other than `honcho-auto`
- **WHEN** lifecycle runs and the probe returns 401
- **THEN** no re-mint occurs (treated as user-owned key)
- **AND** the failure surfaces via the standard `lastError` path

#### Scenario: First start after upgrade back-fills `_autoKeyId`

- **GIVEN** an install pre-dating this change has
  `selfHost.llm.apiKey = "pi-proxy-…"` but no `_autoKeyId`
- **WHEN** lifecycle runs
- **THEN** the system queries `GET /api/model-proxy/api-keys`, finds the
  entry whose hash matches the configured key with label `honcho-auto`,
  and writes its id into `selfHost.llm._autoKeyId`
- **AND** continues the lifecycle without re-minting (key still valid)

### Requirement: Manual re-mint endpoint

The dashboard SHALL expose `POST /api/plugins/honcho/llm/remint-proxy-key`
to allow the user to force-mint a new integrated-proxy key without
waiting for auto-recovery.

#### Scenario: Force-mint succeeds

- **GIVEN** `selfHost.llm.source = "openai-compatible"` and `baseUrl` host
  is one of `host.docker.internal`, `localhost`, `127.0.0.1`
- **WHEN** the client sends `POST /api/plugins/honcho/llm/remint-proxy-key`
- **THEN** the system mints a new `pi-proxy-*` key labelled `honcho-auto`
  with scopes `[models:list, chat, messages]`
- **AND** writes the new key into `selfHost.llm.{apiKey,_autoKeyId}`
- **AND** best-effort revokes the prior key
- **AND** triggers `regenerateComposeForChanges`
- **AND** returns `200 { ok: true }`
- **AND** broadcasts `plugin:honcho:status` with `lastEvent: "remint-success"`

#### Scenario: Refuses when source is not openai-compatible

- **GIVEN** `selfHost.llm.source` is one of `anthropic`, `openai`,
  `gemini`, or `pi-model-proxy`
- **WHEN** the client sends `POST /api/plugins/honcho/llm/remint-proxy-key`
- **THEN** the response is `409` with body
  `{ error: "not-integrated-proxy" }`
- **AND** no key is minted

#### Scenario: Refuses when baseUrl is remote

- **GIVEN** `source = "openai-compatible"` and `baseUrl` host is not in
  `{host.docker.internal, localhost, 127.0.0.1}`
- **WHEN** the client sends `POST /api/plugins/honcho/llm/remint-proxy-key`
- **THEN** the response is `409` with body
  `{ error: "not-integrated-proxy" }`

#### Scenario: Single-flight serialisation

- **GIVEN** a `/server/start` operation is in progress
- **WHEN** the client sends `POST /api/plugins/honcho/llm/remint-proxy-key`
- **THEN** the request awaits the lifecycle mutex before executing
  (no concurrent re-mint)

#### Scenario: Mint failure surfaces as 502

- **WHEN** the underlying `POST /api/model-proxy/api-keys` call fails
  (5xx, network error, malformed response)
- **THEN** the response is `502` with body
  `{ error: "mint-failed", detail: "<message>" }`
- **AND** the existing `selfHost.llm` is left unchanged

### Requirement: Re-mint UI affordance

The Honcho LLM settings section SHALL render a "Re-mint integrated-proxy
key" action when, and only when, the current config visibly points at the
integrated dashboard proxy.

#### Scenario: Button visible for integrated proxy

- **GIVEN** `selfHost.llm.source = "openai-compatible"` and `baseUrl` host
  is one of `host.docker.internal`, `localhost`, `127.0.0.1`
- **WHEN** the user opens **Settings → Honcho → LLM Model**
- **THEN** a "Re-mint integrated-proxy key" action is visible

#### Scenario: Button hidden for direct providers

- **GIVEN** `selfHost.llm.source` is `anthropic`, `openai`, `gemini`, or
  `pi-model-proxy`
- **WHEN** the user opens the LLM section
- **THEN** the re-mint action is not rendered

#### Scenario: Button hidden for remote openai-compatible

- **GIVEN** `source = "openai-compatible"` and `baseUrl` host is, e.g.,
  `api.example.com`
- **WHEN** the user opens the LLM section
- **THEN** the re-mint action is not rendered

#### Scenario: Click triggers endpoint and shows toast

- **WHEN** the user clicks "Re-mint integrated-proxy key" and confirms
- **THEN** the client sends `POST /api/plugins/honcho/llm/remint-proxy-key`
- **AND** on `200`, the LLM section shows a success toast and reloads the
  models list
- **AND** the toast text instructs the user to restart Honcho to apply

### Requirement: Auto-key id is internal and never returned to clients

The `selfHost.llm._autoKeyId` field SHALL be omitted from every
`GET /api/plugins/honcho/config` response and any other client-facing
surface.

#### Scenario: Redacted config GET strips internal field

- **GIVEN** `selfHost.llm._autoKeyId` is set on disk
- **WHEN** the client sends `GET /api/plugins/honcho/config`
- **THEN** the response body does not contain `_autoKeyId` under any path

#### Scenario: Status broadcast does not leak `_autoKeyId`

- **WHEN** the system broadcasts `plugin:honcho:status` after a re-mint
- **THEN** the broadcast payload does not contain `_autoKeyId`
