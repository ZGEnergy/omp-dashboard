<!-- 2026-05-08: tasks 1.1-5b.10 (1-55) implemented at packages/honcho-plugin/ (monorepo override; user picked monorepo over external repo). Task 1.6 (npm-publish.yml) skipped — falls under workspace publish flow. 46 unit tests pass; tsc clean. Docker integration tests deferred (no DOCKER_AVAILABLE env). -->
<!-- 2026-05-08: tasks 6.1-6.14, 7.1-7.7 implemented. Client components: HonchoSettings (main panel), InstallGate, StatusHeader, ConnectionSection, RecallSection, ModeSection, ServerSection, LlmSection (model dropdown w/ search, route override, inline credential editors), DoctorSection, SyncInterviewSection, AdvancedSection (18 Phase-1 flags), DockerMissingCallout, PortOverrideNotice, HonchoBadge, HonchoCardActions (interview popover, sync, map-name), HonchoMapPopover. API helper at src/client/api.ts. Hooks at src/client/hooks.ts. tsc clean; 46 existing tests still pass. -->
<!-- 2026-05-09: tasks 10.2, 10.3, 10.6 implemented. 10.2: pi-memory-honcho added to RECOMMENDED_EXTENSIONS (status: optional, autowired) + 3 test assertions updated. 10.3: file-index-plugins.md row added (caveman style, alphabetical placement, delegated to subagent per docs-write protocol). 10.6: manifest-discoverability.test.ts vendors package.json manifest, validates against dashboard's validateManifest. Required adding ./manifest-validator export to dashboard-plugin-runtime/package.json. 7 new tests in manifest-discoverability + recommended-extensions tests still pass. Total honcho-plugin: 74 passing. -->

## 1. External repo scaffold

- [x] 1.1 Create new external repo `pi-memory-honcho-dashboard` (mirroring the public-package layout used elsewhere in the org)
- [x] 1.2 Add `package.json` with `name: "pi-memory-honcho-dashboard"`, `type: "module"`, MIT license, peer-dep on `pi-memory-honcho`
- [x] 1.3 Add `pi-dashboard-plugin` manifest field with `id: "honcho"`, `displayName: "Honcho Memory"`, `client: "./src/client.tsx"`, `server: "./src/server.ts"`, and slot claims (`settings-section` tab=general, `session-card-badge`, `session-card-action-bar`, `anchored-popover`)
- [x] 1.4 Add dev-deps: TypeScript, Vite (for client build), Vitest, `@blackbelt-technology/dashboard-plugin-runtime`, `@blackbelt-technology/pi-dashboard-shared`, `@honcho-ai/sdk`, React 19 types
- [x] 1.5 Wire `tsconfig.json`, `tsconfig.client.json`, and `vite.config.ts` so the client entry compiles to a single ESM chunk consumable by the dashboard's plugin loader
- [ ] 1.6 Wire `npm-publish.yml` GitHub workflow mirroring the upstream `pi-memory-honcho` workflow (publish on tag push, npm provenance enabled)

## 2. Shared types and utilities

- [x] 2.1 Define `HonchoPluginConfig` type covering every field in the existing `~/.honcho/config.json` shape plus new fields: `mode: "cloud" | "self-host"`, `selfHost.autoStart`, `selfHost.apiPort` (default `8765`), `selfHost.dbPort` (default `5455`), `selfHost.migrationsApplied`, `selfHost.storageBackend: "host-directory" | "docker-volume" | "loop-image"`, `selfHost.llm: { source, model, apiKey?, baseUrl?, embeddingModel?, summaryModel?, deriverModel? }`
- [x] 2.2 Define `HonchoPluginStatus` type per design D6 with `state ∈ {uninstalled, configured, connected, syncing, offline, docker-missing, port-conflict, starting, stopped, running}`
- [x] 2.3 Define request/response types for every REST endpoint listed in design D4
- [x] 2.4 Implement `redactConfig(config)` helper that masks `apiKey` to `apiKeyMasked: "hch-..."` + `apiKeySet: boolean`
- [x] 2.5 Implement `mergeConfig(existing, partial)` deep-merge helper that preserves unknown keys (per spec `honcho-memory-plugin` Atomic write requirement)

## 3. Plugin server entry — config and atomic writes

- [x] 3.1 Implement `readConfigFile()` and `writeConfigFile(partial)` against `~/.honcho/config.json` using temp-file + rename atomic pattern (mirroring dashboard's `json-store.ts`)
- [x] 3.2 Mount `GET /api/plugins/honcho/config` returning redacted config
- [x] 3.3 Mount `POST /api/plugins/honcho/config` that preserves stored secret on empty `apiKey`, deep-merges other fields, and broadcasts a status update
- [x] 3.4 Mount `POST /api/plugins/honcho/sessions` upserting `hosts.pi.sessions[cwd] = name`
- [x] 3.5 Mount `DELETE /api/plugins/honcho/sessions` removing a mapping by `cwd`
- [x] 3.6 Add unit tests for `redactConfig`, `mergeConfig`, and the atomic-write helper (crash-mid-write integrity)

## 4. Plugin server entry — Honcho SDK integration

- [x] 4.1 Add a singleton Honcho SDK client cached on first config read; rebuild on `apiKey`/`endpoint`/`workspace` change
- [x] 4.2 Mount `POST /api/plugins/honcho/interview` calling `aiPeer.conclusionsOf(userPeer).create({ content })` against the configured workspace
- [x] 4.3 Mount `POST /api/plugins/honcho/doctor` running config sanity → endpoint reachability → workspace/peer/session resolution; return `{ checks: Array<{ id, status, detail }> }`
- [x] 4.4 Mount `POST /api/plugins/honcho/sync` forwarding to bridge sessions via the dashboard's existing extension-ui-system event channel (no-op placeholder if no active session running the extension)
- [x] 4.5 Add `GET /api/plugins/honcho/status` returning the current `HonchoPluginStatus`

## 5. Plugin server entry — Docker Compose lifecycle

- [x] 5.1 Embed the docker-compose template (postgres pgvector + honcho api with healthcheck) as a parameterised template (services + healthcheck stable, `volumes:` block rendered per `selfHost.storageBackend`, `environment:` LLM block rendered per `selfHost.llm.source`, `extra_hosts` and `ports:` rendered from config)
- [x] 5.2 Implement `renderComposeYaml(config)` returning the template body with: correct `volumes:` block for the configured backend (`host-directory` → `local` driver bind to `~/.pi-dashboard/honcho/pgdata`; `docker-volume` → default named volume; `loop-image` → `local` driver `loop` (v1 stub: throws `not-implemented` error before write)); correct `environment:` block for the configured LLM source per design D10; `extra_hosts: ["host.docker.internal:host-gateway"]` whenever `selfHost.llm.source=="pi-model-proxy"`; `ports:` from `selfHost.apiPort` (default 8765) and `selfHost.dbPort` (default 5455)
- [x] 5.3 Implement `ensureComposeFile()` that writes `~/.honcho/docker-compose.yml` only if missing (never overwrite existing)
- [x] 5.4 Implement `ensureStorageBackend()` that, for `host-directory`: creates `~/.pi-dashboard/honcho/` and `~/.pi-dashboard/honcho/pgdata/` with mode `0700` if missing; for `docker-volume`: no-op; for `loop-image`: returns a structured `not-implemented` error to the caller
- [x] 5.5 Implement `regenerateComposeForChanges()` writing `~/.honcho/docker-compose.yml.regenerated` when ports OR `selfHost.storageBackend` differ from what's encoded in the existing file (single regeneration path covers both port-override and backend-change cases)
- [x] 5.6 Implement `detectDocker()` running `docker version` with 5s timeout; return `{ available: boolean, error?: string }`
- [x] 5.7 Implement `composeUp()` invoking `docker compose -f <path> up -d` and parsing port-conflict errors to set `state=port-conflict` with `lastError`
- [x] 5.8 Implement `composeDown()` invoking `docker compose -f <path> down`
- [x] 5.9 Implement `pollHealth(endpoint, budgetMs=30000, intervalMs=1000)` polling `<endpoint>/health` until 2xx or budget exhausted
- [x] 5.10 Implement `runMigrations()` invoking `docker compose exec -T api alembic upgrade head` and persisting `selfHost.migrationsApplied=true` on success
- [x] 5.11 Wire plugin `init()` to: run `detectDocker()`, `ensureStorageBackend()`, ensure compose file, call `composeUp()`, `pollHealth()`, run migrations on first boot, broadcast status — all gated on `mode=self-host` AND `selfHost.autoStart=true`
- [x] 5.12 Mount `POST /api/plugins/honcho/server/start` | `/stop` | `/restart` with concurrency-safe serialisation (single in-flight compose op)
- [x] 5.13 Make `POST /api/plugins/honcho/config` reject backend-change while stack running with 409 + body `{ error: "backend-change-requires-stopped-stack" }`
- [x] 5.13a Make `POST /api/plugins/honcho/config` reject `selfHost.llm.source` change while stack running with 409 + body `{ error: "llm-source-change-requires-stopped-stack" }`
- [x] 5.14 Detect Postgres container UID via `docker inspect` on first start; if the host `pgdata` ownership doesn't match, surface as `state=offline` with chmod/chown remediation in `lastError`
- [x] 5.15 Ensure dashboard shutdown does NOT call `composeDown()` (no SIGTERM hook for stop)
- [x] 5.16 Add unit tests for: `renderComposeYaml` per backend, port-override regeneration, backend-change regeneration, merge-not-overwrite, `loop-image` stub error path
- [x] 5.17 Add unit test verifying persistence survives container destruction (integration: `docker compose down` then start again, query a known row)
- [x] 5.18 Implement `detectPiModelProxy()` performing two checks: (a) `GET /api/packages/installed` for `@blackbelt-technology/pi-model-proxy`, (b) `GET http://localhost:9876/v1/models` with 5s timeout. Return `{ installed, reachable, models: string[] }`
- [x] 5.19 On first config write with `mode=self-host` and pi-model-proxy detected, default `selfHost.llm.source="pi-model-proxy"` and walk the documented model preference list (claude-haiku-4-5 → claude-haiku-3-5 → gpt-4o-mini → gemini-2.5-flash → first entry)
- [x] 5.20 Make `POST /api/plugins/honcho/server/start` return 412 with `{ error: "pi-model-proxy-unavailable", detail }` when `selfHost.llm.source=="pi-model-proxy"` and the proxy is not reachable
- [x] 5.21 Extend `POST /api/plugins/honcho/doctor` to include LLM-source checks: api-key presence (no value leaked) for direct providers; host + container reachability of pi-model-proxy when applicable (uses `docker exec api curl host.docker.internal:9876/health`)
- [x] 5.22 Unit tests for `renderComposeYaml` LLM env rendering per source (5 cases) + redaction of api key in `GET /config`

## 5b. Plugin server entry — Aggregate model listing

- [x] 5b.1 Define `LlmSource`, `ModelEntry`, `SourceModelsResponse`, `AggregateModelsResponse` types per design D12
- [x] 5b.2 Author `BUNDLED_MODELS` map per source (anthropic, openai, gemini, openai-compatible) shipping with the plugin; populate with current generation tool-capable models (claude-haiku-4-5, claude-sonnet-4-5, gpt-4o-mini, gpt-4o, gemini-2.5-flash, gemini-2.5-pro, etc.); pi-model-proxy entry is `{ models: [], hasBundledFallback: false }`
- [x] 5b.3 Author `TOOL_CAPABILITY_MAP` keyed by `(source, modelId)` with `supportsTools: boolean`; covers known anthropic/openai/gemini families per design D12
- [x] 5b.4 Implement per-source list-models fetchers: `fetchPiModelProxyModels()`, `fetchAnthropicModels(apiKey)`, `fetchOpenAIModels(apiKey)`, `fetchGeminiModels(apiKey)`, `fetchOpenAICompatibleModels(baseUrl, apiKey?)`. Each: 5s timeout, returns `Result<ModelEntry[], Error>`
- [x] 5b.5 Implement `applyToolCapabilityFilter(source, models)` consulting `TOOL_CAPABILITY_MAP`; default `supportsTools=true` for unknown models when upstream self-declares; flag with `notes: "capability unknown to plugin"`
- [x] 5b.6 Implement in-memory cache with 5-minute TTL keyed by source. Per-source TTL clock. Lost on dashboard restart (no persistence)
- [x] 5b.7 Mount `GET /api/plugins/honcho/models` returning aggregate `AggregateModelsResponse`; for each source, returns cached entry if fresh, else triggers fetch + caches result, else falls back to bundled list with `stale: true`
- [x] 5b.8 Mount `POST /api/plugins/honcho/models/refresh` (busts all caches) and `POST /api/plugins/honcho/models/refresh?source=<source>` (busts one)
- [x] 5b.9 Unit tests: cache hit/miss, TTL expiry, bundled fallback on upstream failure, tool-capability filter, unknown-model default-to-true behaviour, per-source refresh isolation, no-key-leaked in error responses
- [x] 5b.10 Integration test: `GET /api/plugins/honcho/models` against a mocked Anthropic + OpenAI server; verify response shape, capability filtering, error path with bundled fallback

## 6. Plugin client — settings panel

- [x] 6.1 Scaffold `src/client.tsx` with a `HonchoSettings` component subscribed to `usePluginConfig`, `usePluginStatus`, and `usePluginSend`
- [x] 6.2 Implement install-state probe via `fetch("/api/packages/installed")` and gate the UI behind it; render the "Install pi-memory-honcho" call-to-action when missing
- [x] 6.3 Wire the install button to `POST /api/packages/install { source: "npm:pi-memory-honcho" }`; show success toast with reload-required notice
- [x] 6.4 Render the status header showing `mode`, `state`, `endpoint`, `cacheChars`, `sessionKey`
- [x] 6.5 Render the Connection section: `apiKey` (masked, reveal toggle), `peerName`, `workspace`, `aiPeer`, `endpoint`, `linkedHosts` (CSV), `sessionStrategy` (select)
- [x] 6.6 Render the Recall section: `recallMode` radio (`hybrid` / `context` / `tools`)
- [x] 6.7 Render the Mode picker (`cloud` / `self-host`); on switch, POST the config update with auto-set `endpoint` per design D5
- [x] 6.8 Render the Server section (visible only when `mode=self-host`): start / stop / restart buttons, `selfHost.autoStart` checkbox, `selfHost.apiPort` / `selfHost.dbPort` inputs (defaults 8765 / 5455 with helper text "changed from upstream defaults to avoid collision with pi-dashboard:8000 and local Postgres:5432"), `selfHost.storageBackend` radio (host-directory selected; docker-volume enabled; loop-image disabled with `(coming in v0.3 — Linux only)` label), perf note next to the radio explaining the macOS/Windows penalty for `host-directory`, container state pill, last-error display
- [x] 6.8a Render the LLM section (visible only when `mode=self-host`): a single global model dropdown sourced from `GET /api/plugins/honcho/models`, grouped by source, with per-group enabled/disabled state, refresh button, and inline credential-prompts for sources without configured keys.
- [x] 6.8b Implement the LlmModelDropdown component:
  - Search box at top filters by id/displayName
  - Groups: "via pi-model-proxy", "via Anthropic direct", "via OpenAI direct", "via Gemini direct", "via OpenAI-compatible"
  - Per-group header shows count + status pill (✓ reachable / ⚠ stale / disabled with reason)
  - Disabled groups show inline action: "Add Anthropic API key" / "Install pi-model-proxy" / "Configure base URL"
  - Stale groups show a small "using bundled list" pill
  - Selecting an entry: `POST /api/plugins/honcho/config` with `{ selfHost: { llm: { source: <derived>, model: <id> } } }`
  - Refresh button next to the dropdown: `POST /api/plugins/honcho/models/refresh`
- [x] 6.8c Implement secondary route-override dropdown: hidden when the selected `model` is reachable from only one source; visible (and pre-set to current `selfHost.llm.source`) when reachable from multiple. Changing it `POST`s `{ selfHost: { llm: { source: <new source> } } }` without changing `model`
- [x] 6.8d Implement per-source credential editor inline expansion: clicking "Add Anthropic API key" expands a small form below the group header (apiKey field with masked input + reveal); save → `POST /config` then auto-refresh that source's models
- [x] 6.8e Implement "Configure base URL" inline form for openai-compatible: baseUrl + optional apiKey + optional model (free-text fallback when `/models` endpoint isn't supported by the target)
- [ ] 6.8f E2E test: pick a model from each group, verify `selfHost.llm.{source,model}` lands correctly in `~/.honcho/config.json`
- [ ] 6.8g E2E test: route-override dropdown only appears when model is in multiple groups; switching route updates source without changing model id
- [x] 6.9 Render the Doctor button → `POST /api/plugins/honcho/doctor` → inline check list with green/red icons
- [x] 6.10 Render the Sync button → `POST /api/plugins/honcho/sync`
- [x] 6.11 Render the Interview form → `POST /api/plugins/honcho/interview`
- [x] 6.12 Render the Advanced collapsible block with every Phase-1 flag listed in spec `honcho-memory-plugin` Settings panel requirement
- [x] 6.13 Render the Docker-missing callout when `state=docker-missing`
- [x] 6.14 Render the Port-override-pending notice when the regenerated compose sibling exists

## 7. Plugin client — per-session-card slots

- [x] 7.1 Implement `HonchoBadge` component returning `null` when extension uninstalled, otherwise rendering `🧠 <state>` from plugin status
- [x] 7.2 Implement `HonchoCardActions` component returning `null` when extension uninstalled, otherwise rendering `[🧠 Interview]` `[🔄 Sync]` `[🏷️ Map name]` buttons
- [x] 7.3 Wire `[🧠 Interview]` to open a small dialog/popover with a single text input and POST to `/api/plugins/honcho/interview`
- [x] 7.4 Wire `[🔄 Sync]` to `POST /api/plugins/honcho/sync`
- [x] 7.5 Implement `HonchoMapPopover` for the `anchored-popover` slot, pre-filled with `hosts.pi.sessions[cwd]` or the derived default
- [x] 7.6 Wire popover Save → `POST /api/plugins/honcho/sessions { cwd, name }`; Clear → `DELETE /api/plugins/honcho/sessions { cwd }`
- [x] 7.7 Verify only one popover is open at a time (slot multiplicity `one`)

## 8. Plugin status broadcast

- [x] 8.1 Implement `broadcastStatus()` helper inside the plugin server entry that publishes a `HonchoPluginStatus` payload via the runtime's plugin-status channel
- [x] 8.2 Call `broadcastStatus()` after every config write, every lifecycle transition (`composeUp`/`composeDown`/`pollHealth`), and on error
- [x] 8.3 Verify status surfaces in `GET /api/health` `plugins[]` array
- [x] 8.4 Verify subscribed plugin clients (settings panel header, per-card badges) re-render on status updates within one event-loop tick

## 9. Tests

- [x] 9.1 Unit tests for `redactConfig`, `mergeConfig`, atomic-write helper
- [x] 9.2 Unit tests for the docker-compose template content and port-override logic
- [x] 9.3 Unit tests for the `selectMode` / config-switch behaviour (cloud↔self-host transitions per spec)
- [x] 9.4 Integration test: plugin server entry boots without Docker → status reports `docker-missing`, no crash
- [x] 9.5 Integration test: plugin server entry boots in `mode=cloud` → no docker calls, no compose file written
- [ ] 9.6 Integration test (Docker required): full happy path — first boot writes compose file, runs migrations, status reaches `running`; second boot is idempotent and skips migrations
- [ ] 9.7 Integration test: port-conflict bind error surfaces `state=port-conflict` with `lastError` containing the port number
- [ ] 9.8 E2E test against the dashboard fixture: install gate renders when extension absent, full panel renders when present, install button POSTs the right body
- [ ] 9.9 E2E test: per-card badge + action bar gated on extension installation
- [ ] 9.10 E2E test: per-card map popover round-trip (open → edit → save → re-open shows new value)

## 10. Documentation and release

- [x] 10.1 Write README for `pi-memory-honcho-dashboard` covering: install (`pi-dashboard plugin install pi-memory-honcho-dashboard`), cloud-mode quickstart, self-host quickstart, Docker prerequisite, troubleshooting (docker-missing, port-conflict, migrations failed)
- [x] 10.2 Add a one-line entry to `pi-agent-dashboard`'s recommended-plugins list pointing at the new package
- [x] 10.3 Add a row to `docs/file-index-plugins.md` for the new package (caveman style; one line per the file-index protocol)
- [ ] 10.4 Tag and publish v0.1.0 (cloud-mode complete) of `pi-memory-honcho-dashboard`
- [ ] 10.5 Tag and publish v0.2.0 once the docker-compose lifecycle is green on the integration tests
- [x] 10.6 Create a discoverability-test in this repo verifying the plugin's manifest validates against the dashboard's manifest schema (against a vendored snapshot of the package's manifest)

## 11. Migrate honcho slot claims to `session-card-memory` (follow-up to redesign-session-card-subcards)

Deferred from `redesign-session-card-subcards` to keep the base UI commit independent. The dashboard already defines the `session-card-memory` slot and renders contributions inside the `MemorySubcard`; this group migrates honcho's claims so the badge + actions land in the MEMORY subcard.

- [ ] 11.1 Update `packages/honcho-plugin/package.json` manifest: change `HonchoBadge` claim from `session-card-badge` → `session-card-memory`; change `HonchoCardActions` claim from `session-card-action-bar` → `session-card-memory`. Keep `HonchoSettings` (`settings-section`) and `HonchoMapPopover` (`anchored-popover`) unchanged.
- [ ] 11.2 Update top-of-file slot-routing comment in `packages/honcho-plugin/src/client/index.tsx` (currently documents `HonchoBadge → session-card-badge` etc.) to reflect the new routing.
- [ ] 11.3 Update top-of-file JSDoc comments in `packages/honcho-plugin/src/client/HonchoBadge.tsx` and `HonchoCardActions.tsx` (currently `"— session-card-badge slot"` / `"— session-card-action-bar slot"`) to say `session-card-memory`.
- [ ] 11.4 Update `packages/honcho-plugin/src/__tests__/manifest-discoverability.test.ts` (and any other manifest tests) to assert the new slot ids.
- [ ] 11.5 Verify visually: in a session-card with honcho extension installed, the MEMORY subcard renders with the badge + action buttons inside; WORKSPACE subcard no longer carries the honcho brain icon.
- [ ] 11.6 Run the dashboard repo lints (`packages/jj-plugin/src/__tests__/manifest.test.ts` pattern — may not apply to honcho but rerun full test suite to confirm no regression).
- [ ] 11.7 Bump `pi-memory-honcho-dashboard` to v0.3.0 (or appropriate semver) since slot ids are part of the plugin's public contract; mention in CHANGELOG that the badge + actions now require a dashboard version that defines `session-card-memory` (i.e. shipped after `redesign-session-card-subcards` lands).
