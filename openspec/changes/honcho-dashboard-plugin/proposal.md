## Why

`pi-memory-honcho` (acsezen) ships persistent cross-session memory for pi via Honcho, but every user-facing surface lives behind TUI slash-commands (`/honcho:setup`, `/honcho:doctor`, `/honcho:interview`, …). Dashboard users have no way to configure, observe, or control Honcho without dropping into the TUI, and self-hosting Honcho today requires the user to manually clone the upstream repo, run `docker compose up`, and apply migrations — completely outside the dashboard. We want a dashboard plugin that mirrors the TUI surfaces as a settings page + per-card actions, and (when chosen) brings up a self-hosted Honcho stack on its own.

## What Changes

- **Monorepo package** at `packages/honcho-plugin/` published as `@blackbelt-technology/pi-dashboard-honcho-plugin`. Discovered by the dashboard plugin loader at boot via its `pi-dashboard-plugin` manifest field.
- Plugin manifest claims four slots: `settings-section` (general tab), `session-card-memory` (twice — for badge and actions), `anchored-popover` (for the per-card session-name editor). NOTE: original claims targeted `session-card-badge` + `session-card-action-bar`; reroute to the dedicated `session-card-memory` slot is tracked in tasks §11 (introduced by `redesign-session-card-subcards`).
- **Extension install gate**: plugin probes `GET /api/packages/installed` for `pi-memory-honcho`. If absent, the settings panel renders an "Install pi-memory-honcho" call-to-action that POSTs to the existing `/api/packages/install` endpoint. Installation tracks progress in real time via the dashboard's WebSocket `package_progress` / `package_operation_complete` channel — the gate shows a spinner, streaming progress messages, an indeterminate progress bar during install, a success banner on completion, and a retry button on failure. Card-level slots stay hidden until the extension is installed.
- **Settings panel** (Settings → General → Honcho Memory) ports these TUI commands to the dashboard:
  - `/honcho:setup` → connection form (api key + masked reveal, peer name, workspace, AI peer, endpoint, linked hosts, session strategy)
  - `/honcho:status` → status header (connected / syncing / offline + cache size + session key + active recall mode)
  - `/honcho:doctor` → "Run preflight" button rendering an inline check list with ✅/⚠️/❌ icons
  - `/honcho:sync` → "Force refresh" button with forwarded-count feedback
  - `/honcho:mode` → inline recall-mode radio (hybrid / context / tools)
  - `/honcho:interview` → "Save a preference" form section with success/error feedback
  - Mode picker: cloud ↔ self-host radio (switching auto-sets/clears `hosts.pi.endpoint` per design D5)
  - All Phase-1 advanced env-var flags (writeFrequency, dialecticDynamic, dialecticMaxChars, dialecticMaxInputChars, reasoningLevel, reasoningLevelCap, contextCadence, dialecticCadence, sessionPeerPrefix, observationMode, contextTokens, contextRefreshTtlSeconds, maxMessageLength, searchLimit, saveMessages, injectionFrequency, environment, logging) → collapsible "Advanced" section.
- **Self-host server section** (visible only when `mode=self-host`):
  - Start / stop / restart buttons with state pill (Running / Starting / Stopped / Docker missing / Port conflict / Offline)
  - Auto-start on dashboard launch checkbox
  - API port (default 8765) and DB port (default 5455) — changed from upstream 8000/5432 to avoid collisions with pi-dashboard and local Postgres
  - Storage backend radio: host-directory (default, `~/.pi-dashboard/honcho/pgdata/`), docker-volume (opt-in), loop-image (disabled, coming in v0.3)
  - macOS/Windows perf warning for host-directory bind mounts
  - Docker-missing callout with install link when Docker not found
  - Last-error display from plugin status
- **LLM model picker** (visible only when `mode=self-host`):
  - Single global model dropdown sourced from `GET /api/plugins/honcho/models`, an aggregate endpoint that fetches model lists from all configured LLM sources (pi-model-proxy, Anthropic, OpenAI, Gemini, OpenAI-compatible) with 5-minute cache + bundled fallback lists
  - Search box, grouped by source, per-group status pills (✓ reachable / ⚠ stale / disabled)
  - Secondary route-override dropdown when a model is reachable from multiple sources
  - Inline credential editors per source: API key masked input for direct providers, base URL + optional key for OpenAI-compatible
  - Refresh button to bust model list cache
- **Per-session-card surfaces**:
  - `session-card-memory` (HonchoBadge): 🧠 status pill (connected / syncing / offline) gated on extension installation. Renders inside the MEMORY subcard.
  - `session-card-memory` (HonchoCardActions): `[🧠 Interview]` `[🔄 Sync]` `[🏷️ Map name]` buttons. Renders inside the MEMORY subcard alongside the badge.
  - `[🧠 Interview]` opens a small popover with text input directly on the card.
  - `[🏷️ Map name]` opens an `anchored-popover` with a single text field + Save/Clear/Cancel; saving merges `hosts.pi.sessions[cwd] = name` into `~/.honcho/config.json`. Replaces the global sessions-map editor.
- **Plugin server entry** exposes REST endpoints (auth-gated, scoped under `/api/plugins/honcho/`):
  - `GET /config`, `POST /config` → atomic read/write of `~/.honcho/config.json` with secret preservation and deep-merge. 409 on storage-backend or LLM-source change while stack running.
  - `POST /doctor` → server-side preflight (config sanity + connectivity probe + LLM-source checks).
  - `POST /sync` → forwards to the in-session bridge to flush + refresh.
  - `POST /interview` → writes a conclusion via Honcho SDK against the configured workspace.
  - `POST /sessions`, `DELETE /sessions` → session-name map upsert/remove.
  - `GET /status` → current `HonchoPluginStatus`.
  - `POST /server/start`, `POST /server/stop`, `POST /server/restart` → self-host server controls with concurrency-safe serialisation.
  - `GET /models` → aggregate model listing across all configured sources with caching and bundled fallback.
  - `POST /models/refresh` → bust model list cache (all sources or per-source).
- **Status broadcast**: `setStatus()` calls broadcast `HonchoPluginStatus` to all connected browsers via the plugin runtime's `broadcastToSubscribers` channel, wired on plugin init. Status surfaces in `GET /api/health.plugins[]` and drives real-time updates in the settings header and per-card badges.
- **Self-host server lifecycle** (mode=`self-host`):
  - Plugin ships an opinionated `docker-compose.yml` template (postgres+pgvector + honcho api with healthcheck). Written to `~/.honcho/docker-compose.yml` on first run; **never overwritten** afterwards so user customisations survive. Port-override or backend changes write a `.regenerated` sibling.
  - LLM provider configuration via `selfHost.llm` config — maps to compose env vars (`LLM_*` + `DIALECTIC_*`) per five supported sources. pi-model-proxy is the recommended default when installed (auto-detects via `/api/packages/installed` + `localhost:9876/v1/models` probe).
  - Plugin server entry auto-runs `docker compose up -d` on dashboard boot when `mode=self-host` and `autoStart=true`, waits for `/health` on the configured endpoint (default `http://localhost:8765`, 30 s timeout), and runs Honcho alembic migrations once on first boot.
  - Plugin **never** stops the docker stack on dashboard shutdown — other pi sessions may depend on it. Stop is explicit (button or `POST /server/stop`).
  - Docker-daemon-missing and port-collision errors are surfaced as plugin status (`docker-missing`, `port-conflict`) and rendered in the settings panel without auto-falling-back to cloud mode.
  - Postgres container UID mismatch detection on first start with remediation guidance.
  - Switching `mode` from cloud to self-host auto-writes `endpoint=http://localhost:<apiPort>` (default 8765) into `hosts.pi.endpoint` while preserving `apiKey` so the user can switch back without losing it.
- TUI slash-commands on the extension stay registered as-is — the dashboard surfaces are purely additive; existing users are not affected.

## Capabilities

### New Capabilities
- `honcho-memory-plugin`: the dashboard plugin manifest, slot claims, settings panel, per-session card actions, REST endpoints, extension-install gate with live progress tracking, `~/.honcho/config.json` round-trip, and aggregate model listing.
- `honcho-server-lifecycle`: opinionated docker-compose orchestration for the self-hosted Honcho server — template generation with configurable storage backends and LLM sources, auto-start at dashboard boot, start/stop/restart controls, doctor preflight (Docker daemon, port conflicts, schema migrations, LLM-source reachability), pi-model-proxy auto-detection.

### Modified Capabilities
- _None._ Plugin loads through the existing `dashboard-plugin-loader` capability without changing its requirements.

## Impact

- **Monorepo package**: `packages/honcho-plugin/` published as `@blackbelt-technology/pi-dashboard-honcho-plugin`. Part of the workspace npm publish flow.
- **Runtime dependencies**: `@honcho-ai/sdk`, `@blackbelt-technology/dashboard-plugin-runtime`, `@blackbelt-technology/pi-dashboard-shared`, `@mdi/js`, `@mdi/react`.
- **Cross-package dependency**: plugin shares ownership of `~/.honcho/config.json` with the existing `pi-memory-honcho` extension. All plugin writes go through an atomic-write helper (temp-file + rename) with deep-merge to preserve unknown keys.
- **New optional runtime dependency**: Docker (only when `mode=self-host`). Detection is best-effort (`docker version` exit code); missing daemon is surfaced as plugin status, not a dashboard-level failure.
- **New filesystem footprint**: `~/.honcho/docker-compose.yml` (plugin-managed, idempotent first-write), `~/.pi-dashboard/honcho/pgdata/` (default host-directory storage backend), and Docker containers/volumes for Postgres and Honcho API.
- **Default ports**: API on 8765 (not 8000 — avoids pi-dashboard collision), Postgres on 5455 (not 5432 — avoids local Postgres collision). User-overridable in settings.
- **Auto-start side effect**: dashboard boot triggers `docker compose up -d` when `mode=self-host` and `autoStart=true`. Idempotent; no-op when stack is already running.
- **Security posture**: plugin REST endpoints are auth-gated through the existing dashboard auth plugin. API keys remain redacted on `GET /config` (returns `apiKeyMasked` + `apiKeySet` boolean). LLM API keys in `selfHost.llm` follow the same redaction contract. No secrets cross to the browser.
- **51 unit/integration tests** covering: redactConfig, mergeConfig, atomic writes, compose template rendering (per backend, per LLM source), port-override regeneration, tool-capability filtering, model list caching/fallback, mode switching, boot without Docker, cloud-mode boot.
