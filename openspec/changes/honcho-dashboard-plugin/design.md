## Context

`pi-memory-honcho` (acsezen) is an existing pi extension that ships persistent cross-session memory backed by [Honcho](https://honcho.dev). All user-facing surfaces today are TUI slash-commands (`/honcho:setup`, `/honcho:status`, `/honcho:doctor`, `/honcho:sync`, `/honcho:mode`, `/honcho:interview`, `/honcho:map`, `/honcho:config`) plus a `🧠 Honcho …` status string written via `pi.ui.setStatus`. The extension reads/writes `~/.honcho/config.json` and talks HTTP to either honcho.dev or a self-hosted Honcho API server (FastAPI + Postgres + pgvector).

The dashboard already supports plugins discovered through `dashboard-plugin-loader`: an npm package with a `pi-dashboard-plugin` manifest field exposes slot claims (UI contributions) and an optional server entry. The runtime auto-loads any installed package matching the manifest from the dashboard server's `node_modules` at boot. We will use that loader unchanged.

Two install spaces exist on disk and are independent:

```
pi extension space          dashboard plugin space
~/.pi/agent/packages/  vs.  <dashboard-server>/node_modules/
                            (or ~/.pi-dashboard/ packages root)
```

A user installing `pi-memory-honcho` does NOT automatically install `pi-memory-honcho-dashboard`, and vice versa. The plugin must explicitly probe whether the extension is present in the pi space; the existing endpoint `/api/packages/installed` exposes that list.

Self-hosting Honcho today requires the user to manually clone `plastic-labs/honcho`, copy `docker-compose.yml.example`, configure env vars, run `docker compose up -d`, and apply `alembic upgrade head` migrations. That friction is the main motivation for the server-lifecycle half of this change.

## Goals / Non-Goals

**Goals:**

- Mirror every locked TUI surface (`setup`, `status`, `doctor`, `sync`, `mode`, `interview`, advanced flags) as a single dashboard settings page.
- Provide per-session-card actions (interview / sync / map name) and a status badge, gated on extension installation.
- Replace the global "sessions map" table with a per-card `[🏷️ Map name]` popover that mutates `hosts.pi.sessions[cwd]`.
- Offer a "Self-host" mode that auto-starts a Honcho stack via Docker Compose at dashboard boot, with explicit start/stop/restart controls.
- Keep the existing extension fully functional without modification — dashboard surfaces are additive.
- Ship as an external npm package (`pi-memory-honcho-dashboard`) so it follows the same install/upgrade path as any other dashboard plugin.
- Atomic, race-free writes to the shared `~/.honcho/config.json` between the extension (read-only at session start) and the plugin (read/write on user action).

**Non-Goals:**

- Forking or modifying the upstream `pi-memory-honcho` extension. We may publish minor PRs for missing hooks if needed but do not own that codebase.
- Replacing TUI commands. Slash-commands stay registered for parity with users who do not use the dashboard.
- Custom tool-renderers for `honcho_search` / `honcho_context` / `honcho_profile` (deselected during exploration).
- Native (non-Docker) Honcho server installation (uv + uvicorn + bring-your-own Postgres). Docker is the only supported self-host path.
- Cross-host federation UI. The extension already supports `linkedHosts`; the plugin exposes it as a CSV input but does not render a graph or status per linked host.
- Honcho upgrade flows (image pinning, blue/green migrations). The plugin pins the Honcho image tag in the compose template; upgrades are a manual edit + restart.
- Persisting plugin state outside of `~/.honcho/config.json` and the plugin runtime's own `pluginConfig` store.

## Decisions

### D1. Two-package layout, install-state gate

The plugin is published as `pi-memory-honcho-dashboard` and is independent of `pi-memory-honcho`. The plugin client mounts and probes `GET /api/packages/installed` for the extension package id. If absent, all plugin surfaces render as a single "Install pi-memory-honcho" gate card. Card-level slot contributions return `null` to keep cards clean when the gate fails.

Alternatives considered:

- **Single npm package** that ships both the pi extension entry and the dashboard plugin manifest. Rejected: requires forking `pi-memory-honcho` and forces dashboard users to take the extension code into pi space whether they want it or not.
- **Server-side detection** by introspecting active sessions for registered `honcho_*` tools. Rejected: leaks bridge-protocol details into the plugin, and gives wrong answers when the extension is installed but no session has loaded yet.

### D2. Slot claims

| Slot | Component | Multiplicity | Visibility gate |
|---|---|---|---|
| `settings-section` (`tab=general`) | `HonchoSettings` | many | always (renders gate when uninstalled) |
| `session-card-memory` | `HonchoBadge` | many | extension installed |
| `session-card-memory` | `HonchoCardActions` | many | extension installed |
| `anchored-popover` | `HonchoMapPopover` | one | opened from `HonchoCardActions` |

Rationale: settings-section + per-card surfaces is exactly the dashboard's pattern for "extension that affects every session" (mirrors how the bridge-extension settings + per-card actions are split). The `anchored-popover` slot is `multiplicity: one`, which matches the UX (only one popover open at a time).

### D3. `~/.honcho/config.json` ownership and write discipline

The file is shared with the existing extension. We resolve concurrency by:

- All plugin writes go through a single `writeConfig(partial)` helper in the plugin server entry that uses an atomic write (temp-file + `rename`) to mirror the dashboard's existing `json-store.ts` pattern.
- The helper deep-merges `partial` into the existing file, never overwriting unrelated keys (e.g. honcho-cli writes are preserved).
- Reads on the client always go through `GET /api/plugins/honcho/config` so the server can redact `apiKey` (returns `apiKeyMasked: "hch-..."` and `apiKeySet: boolean`). Plain values for everything else.
- `apiKey` updates from the client send `{ apiKey: "<new>" }`; an empty/unchanged value preserves the stored secret. Matches the existing dashboard secret-preservation contract from `config-api.ts`.

Alternatives considered:

- **Direct fs reads from the client renderer**. Rejected — secrets would leak into the browser bundle, and Electron-vs-browser would diverge.
- **Mirroring config into the dashboard's own preferences store**. Rejected — duplication, and the extension would not see updates.

### D4. Plugin server REST surface

Routes scoped under `/api/plugins/honcho/`, registered through the plugin runtime's standard server-context API. All routes are auth-gated through the existing dashboard auth plugin.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/config` | Read merged config (apiKey redacted). |
| `POST` | `/config` | Atomic deep-merge write. Empty `apiKey` field preserves the stored secret. |
| `POST` | `/sessions` | Upsert `hosts.pi.sessions[cwd] = name`. Body: `{ cwd, name }`. |
| `DELETE` | `/sessions` | Remove a mapping. Body: `{ cwd }`. |
| `POST` | `/doctor` | Run preflight: config sanity → endpoint reachable → workspace/peer/session resolves. Returns `{ checks: Array<{ id, status, detail }> }`. |
| `POST` | `/sync` | Forward to bridge: clear context cache + flush pending uploads. Implementation forwards via the dashboard's existing extension-ui-system event channel. |
| `POST` | `/interview` | Body: `{ content }`. Calls `aiPeer.conclusionsOf(userPeer).create(...)` server-side using the configured workspace + apiKey. |
| `GET` | `/server/status` | `{ mode, state, port, dockerAvailable, lastError }`. `state ∈ {stopped, starting, running, exited, port-conflict, docker-missing}`. |
| `POST` | `/server/start` \| `/stop` \| `/restart` | Lifecycle controls. Idempotent. |

Rationale: keeping `/sync` and `/interview` server-side means the apiKey never crosses to the renderer and we have a single Honcho SDK client (with caching) per dashboard process.

### D5. Self-host server via Docker Compose

The plugin owns a single template, written to `~/.honcho/docker-compose.yml` on first run when `mode=self-host`. **It is never overwritten** afterwards, so user customisations survive. Persistence path is decided by D9 (storage backend); default is a host-directory bind at `~/.pi-dashboard/honcho/pgdata/`. Default template (storage backend = `host-directory`):

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: honcho
      POSTGRES_USER: honcho
      POSTGRES_PASSWORD: honcho
    volumes: [honcho-pg:/var/lib/postgresql/data]
    ports: ["5455:5432"]   # host:container — host port from selfHost.dbPort, default 5455
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U honcho -d honcho"]
      interval: 5s
      retries: 10
  api:
    image: ghcr.io/plastic-labs/honcho:latest
    depends_on: { postgres: { condition: service_healthy } }
    environment:
      DB_CONNECTION_URI: postgresql+psycopg://honcho:honcho@postgres:5432/honcho
      # LLM provider env block rendered per D10 (defaults to pi-model-proxy if installed,
      # else first configured provider). Keys/URLs injected at template-write time.
    extra_hosts:
      - "host.docker.internal:host-gateway"   # required on Linux, no-op on Docker Desktop
    ports: ["8765:8000"]   # host:container — host port from selfHost.apiPort, default 8765
volumes:
  honcho-pg:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${HONCHO_PG_DEVICE}   # plugin sets to $HOME/.pi-dashboard/honcho/pgdata
```

Port defaults: `selfHost.apiPort=8765` (was 8000 — collided with pi-dashboard) and `selfHost.dbPort=5455` (was 5432 — collided with any local Postgres). User-overridable via the settings panel; the host-side ports flow into the compose `ports:` mapping while the container-side ports stay at Honcho/Postgres canonical values.

The plugin renders `${HONCHO_PG_DEVICE}` to the absolute, user-expanded `~/.pi-dashboard/honcho/pgdata` at template-write time (env-var substitution happens before write — the on-disk compose file contains the resolved absolute path so `docker compose` does not need the env var present at run time).

Lifecycle:

1. Plugin server `init()` reads `mode`. If `cloud`, skip lifecycle entirely.
2. If `self-host`, run `docker version` (5 s timeout). On non-zero exit → `state=docker-missing`, surface in plugin status, do **not** auto-fall-back to cloud.
3. Ensure `~/.honcho/docker-compose.yml` exists (write template if missing).
4. Run `docker compose -f ~/.honcho/docker-compose.yml up -d`.
5. Poll `GET <endpoint>/health` with 1 s interval, 30 s timeout. `state=running` on first 2xx.
6. On first successful boot ever (tracked in plugin config: `selfHost.migrationsApplied: boolean`), run `docker compose exec -T api alembic upgrade head` and persist the flag.
7. Auto-start triggers on every dashboard server boot. Compose `up -d` is idempotent — no-op if already running.
8. Dashboard shutdown does **not** stop the stack (other pi sessions may still depend on it). Stop is explicit (button or `POST /server/stop`).

Switching `mode=cloud → self-host` auto-writes `hosts.pi.endpoint=http://localhost:<selfHost.apiPort>` (default `http://localhost:8765`), preserving `apiKey` so the user can switch back without reconfiguring.

Switching `mode=self-host → cloud` clears `hosts.pi.endpoint` (Honcho SDK falls back to cloud default) but does not touch the running stack — user must explicitly stop it.

Alternatives considered:

- **Embed Postgres + Honcho as a child process via `uv` and `uvicorn`**. Rejected — pulls a Python toolchain into Node-only territory; Postgres still needs separate orchestration.
- **Pull only the Honcho image and ask user to provide their own Postgres**. Rejected — defeats "auto-create database and run it" requirement.
- **Auto-stop on dashboard shutdown**. Rejected — multiple dashboards may run; bridges in non-dashboard pi sessions still need the API up.

### D6. Plugin status broadcast

Plugin participates in the existing `/api/health.plugins[]` channel. Status payload:

```typescript
type HonchoPluginStatus = {
  id: "honcho";
  state: "uninstalled" | "configured" | "connected" | "syncing" | "offline"
       | "docker-missing" | "port-conflict" | "starting" | "stopped";
  mode: "cloud" | "self-host";
  endpoint: string;
  cacheChars: number;
  sessionKey: string | null;
  lastError?: string;
};
```

The settings panel header and per-card badge both subscribe via the plugin runtime's `usePluginStatus()` hook (added to `dashboard-plugin-runtime/src/plugin-context.tsx` if not already present).

### D7. Auto-start opt-out path

Even with self-host as default, the user must be able to turn auto-start off without losing their config:

- `selfHost.autoStart: boolean = true` in config.
- If `mode=self-host` and `autoStart=false`, plugin init reports `state=stopped` and waits for an explicit user action.
- The settings panel surfaces `[ ] Auto-start on dashboard launch` checkbox in the Server section.

### D8. Per-card "Map name" via `anchored-popover`

The popover contains a single text input pre-filled with the current `sessions[cwd]` value (or the derived default per `sessionStrategy`). On save → `POST /api/plugins/honcho/sessions { cwd, name }`. On clear → `DELETE`. Closing without save discards. The popover unmounts the moment another anchored-popover is opened (slot multiplicity is `one`).

The button is gated on the session having a `cwd` (true for all server-tracked sessions).

### D9. Storage backend selection

Persistence for the self-hosted Postgres database is configured via `selfHost.storageBackend ∈ { "host-directory" | "docker-volume" | "loop-image" }`. Default: `host-directory`. The plugin renders the `volumes:` block of the compose template differently per backend.

```
  Backend          On-disk location           Cross-platform   Notes
  ─────────────    ─────────────────────────  ──────────────   ──────────────────────────────
  host-directory   ~/.pi-dashboard/honcho/    yes              Default. User-visible. Backup
  (default)        pgdata/                                     by copying the dir. Native I/O
                                                               on Linux; ~10-25% slower on
                                                               macOS/Windows due to Docker
                                                               Desktop's bind-mount FUSE/
                                                               Virtiofs translation.

  docker-volume    Docker's data dir on Linux yes              Opt-in. Faster on macOS/Windows
                   / VM image on Mac/Win                       (data lives inside the Linux VM,
                                                               no bind translation). NOT under
                                                               ~/.pi-dashboard/honcho. Backup
                                                               via `docker run --rm -v ...`.

  loop-image       ~/.pi-dashboard/honcho/    Linux only       v1 STUB — returns "not implemented".
                   postgres.img (sparse)                       Requires sudo on first init for
                                                               loopback mount + mkfs.ext4.
                                                               Deferred to a follow-up change.
```

Rationale: `host-directory` was selected as the default because the user explicitly wanted persistence visible under `~/.pi-dashboard/honcho/`. The perf penalty on macOS/Windows is real but not catastrophic for typical Honcho workloads (Postgres is fsync-bound on WAL writes; the bind-mount overhead is on filesystem syscalls, which dominate only on read-heavy small-record workloads). Users who feel the penalty can opt into `docker-volume` and accept that the data is no longer under their home directory.

`loop-image` is acknowledged in the type but stubbed in v1: `POST /api/plugins/honcho/server/start` with `storageBackend="loop-image"` returns a structured error pointing to a future change. We did not collapse this into the type because the user wants the option visible in the settings panel even if disabled.

**Compose-template volume rendering per backend:**

```yaml
# host-directory (default)
volumes:
  honcho-pg:
    driver: local
    driver_opts: { type: none, o: bind, device: /home/u/.pi-dashboard/honcho/pgdata }

# docker-volume
volumes:
  honcho-pg: {}

# loop-image (v1 stub)
volumes:
  honcho-pg:
    driver: local
    driver_opts: { type: ext4, o: loop, device: /home/u/.pi-dashboard/honcho/postgres.img }
```

**Backend-switch contract:** changing `selfHost.storageBackend` while the stack is running is **rejected** by `POST /api/plugins/honcho/config` with a 409 — the user must stop the stack first. We do not migrate data between backends automatically; the user runs `pg_dump` from the old backend and `pg_restore` against the new one. This is documented in the README.

**Path discipline:** the plugin creates `~/.pi-dashboard/honcho/pgdata/` with mode `0700` on first start and chowns it to the host UID matching the Postgres container user (if recoverable; otherwise leaves it to the user with a clear error in plugin status). The directory's parent `~/.pi-dashboard/honcho/` is also created `0700` if missing.

### D10. Honcho LLM provider configuration

Honcho's API container needs an LLM for memory extraction, summarization, dialectic reasoning, and dream consolidation (defaults internally to `openai/gpt-5.4-mini`, which requires `LLM_OPENAI_API_KEY`). The plugin SHALL expose `selfHost.llm` config that selects one of five sources, and SHALL render the matching `LLM_*` env block into the compose template's `api` service:

```
  Source                Env vars rendered into api service
  ──────────────────    ───────────────────────────────────────────────
  pi-model-proxy        LLM_OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:9876/v1
  (recommended;          LLM_OPENAI_COMPATIBLE_API_KEY=<empty or proxy key if user set one>
   D11)                 DIALECTIC_PROVIDER=openai-compatible
                        DIALECTIC_MODEL=<from settings; e.g. anthropic/claude-haiku-4-5>
  ──────────────────    ───────────────────────────────────────────────
  Anthropic direct      LLM_ANTHROPIC_API_KEY=<user key>
                        DIALECTIC_PROVIDER=anthropic
                        DIALECTIC_MODEL=<from settings; e.g. claude-haiku-4-5>
  ──────────────────    ───────────────────────────────────────────────
  OpenAI direct         LLM_OPENAI_API_KEY=<user key>
                        DIALECTIC_PROVIDER=openai
                        DIALECTIC_MODEL=<e.g. gpt-4o-mini>
  ──────────────────    ───────────────────────────────────────────────
  Gemini direct         LLM_GEMINI_API_KEY=<user key>
                        DIALECTIC_PROVIDER=gemini
                        DIALECTIC_MODEL=<e.g. gemini-2.5-flash>
  ──────────────────    ───────────────────────────────────────────────
  Custom                LLM_OPENAI_COMPATIBLE_BASE_URL=<user URL>
  OpenAI-compatible     LLM_OPENAI_COMPATIBLE_API_KEY=<user key>
                        DIALECTIC_PROVIDER=openai-compatible
                        DIALECTIC_MODEL=<user-supplied>
```

Config shape:

```typescript
selfHost.llm: {
  source: "pi-model-proxy" | "anthropic" | "openai" | "gemini" | "openai-compatible";  // DERIVED from model pick (D12)
  model: string;       // e.g. "anthropic/claude-haiku-4-5" or "gpt-4o-mini"
  apiKey?: string;     // for direct sources; redacted on GET /config
  baseUrl?: string;    // for openai-compatible only
  // Per-task overrides (optional, advanced)
  embeddingModel?: string;
  summaryModel?: string;
  deriverModel?: string;
}
```

The `source` field is *derived* from the user's model selection in the settings panel (per D12), not picked independently. When the user picks a model from the global model dropdown, the plugin sets both `source` and `model` atomically. When a model is reachable via multiple sources, the user can pick the route via a secondary control. This means `source` is never "out-of-sync" with `model` — they always describe a valid pair.

The key field is redacted in the same way as `apiKey` at the top level: `GET /config` returns `selfHost.llm.apiKeySet: boolean` + `apiKeyMasked`, `POST /config` with empty `apiKey` preserves the stored secret.

**Switch-while-running rule:** changing `selfHost.llm.source` (or any `LLM_*`-affecting field) while the stack is `running` returns 409 from `POST /config`. Same contract as `storageBackend`. The user must stop the stack, change the model, then start again.

Alternatives considered:

- **Hardcode pi-model-proxy as the only path**. Rejected — users may want to use Honcho without pi installed, or with provider keys they already manage outside pi. We keep all five paths.
- **Surface every `LLM_*` env var as raw config**. Rejected — too many knobs, too easy to misconfigure. The five-source model maps the common cases; advanced users can customise the rendered compose file directly (it's never overwritten by the plugin).
- **Source-first then model dropdown**. Rejected (per D12) — less discoverable, requires the user to make two decisions when one suffices.

### D11. pi-model-proxy as recommended LLM source

pi-model-proxy ([@blackbelt-technology/pi-model-proxy](https://github.com/BlackBeltTechnology/pi-model-proxy)) exposes pi's authenticated models on `localhost:9876` as OpenAI-compatible AND Anthropic-compatible endpoints. Pointing Honcho at it eliminates the need for users to manage a separate Anthropic/OpenAI API key for Honcho — it inherits whatever pi is already authenticated with (OAuth subscriptions included).

**Detection:**

1. Plugin server probes `GET /api/packages/installed` (the same endpoint used for the `pi-memory-honcho` extension gate).
2. If `@blackbelt-technology/pi-model-proxy` is present, plugin probes `GET http://localhost:9876/v1/models` to verify the proxy is actually reachable + populate the model list cache (D12).
3. Both checks pass → pi-model-proxy is the **preferred route** in the global model dropdown. When a model is reachable via both pi-model-proxy and a direct provider, the dropdown groups it under "via pi-model-proxy" first.
4. Either check fails → the "via pi-model-proxy" group in the dropdown is rendered but disabled with an inline "Install pi-model-proxy" button (mirrors the pi-memory-honcho install gate). Models reachable via pi-model-proxy still appear if a direct route is configured.

**Route override:** when the user picks a model that's reachable via multiple routes, a small dropdown next to the selected model lets them switch the route. The plugin updates `selfHost.llm.source` accordingly without changing `selfHost.llm.model`.

**Compose-template effects when source = pi-model-proxy:**

- `extra_hosts: ["host.docker.internal:host-gateway"]` is rendered into the api service (always — it's a no-op on Docker Desktop and required on Linux).
- `LLM_OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:9876/v1`
- `LLM_OPENAI_COMPATIBLE_API_KEY` rendered only if the user explicitly set a proxy key (pi-model-proxy's `apiKey` config field). Otherwise omitted.
- `DIALECTIC_PROVIDER=openai-compatible`
- `DIALECTIC_MODEL=<from selfHost.llm.model>` — the plugin populates the dropdown from `GET /v1/models`; default selection is `anthropic/claude-haiku-4-5` if available, else the first model the proxy reports.

**Default model preference order** (when source=pi-model-proxy, on first config write):

1. `anthropic/claude-haiku-4-5` (cheap, fast, tool-calling-capable)
2. `anthropic/claude-haiku-3-5-20241022`
3. `openai/gpt-4o-mini`
4. `google/gemini-2.5-flash`
5. First model returned by `GET /v1/models`

The plugin walks the list and picks the first one present in the proxy's reported model list.

Alternatives considered:

- **Auto-install pi-model-proxy on first plugin init**. Rejected — too invasive; the dashboard already requires installing the `pi-memory-honcho` extension, doubling the auto-installs is friction.
- **Pre-select OpenAI direct (Honcho's actual default)**. Rejected (per locked decision Q4) — the user explicitly wanted pi-model-proxy as the recommended path.

### D12. Aggregate model listing endpoint

The plugin SHALL expose `GET /api/plugins/honcho/models` that aggregates the model lists from every configured (or detectable) LLM source into a single response, grouped by source, filtered to tool-call-capable models. The settings panel SHALL render this as a single global model dropdown rather than the source-first picker (per the locked UX decision).

**Response shape:**

```typescript
GET /api/plugins/honcho/models  →
{
  sources: {
    [source in LlmSource]: {
      available: boolean;          // true iff source is detectable + creds configured
      reachable: boolean;          // true iff list-models call succeeded (or fallback used)
      stale: boolean;              // true iff response served from bundled fallback list
      lastFetched: string | null;  // ISO timestamp of cache fill
      models: Array<{
        id: string;              // exact model id Honcho will use
        displayName: string;     // human-readable
        supportsTools: boolean;  // always true after filtering
        contextWindow?: number;
        notes?: string;          // e.g. "deprecated 2026-Q3"
      }>;
      error?: string;            // if reachable=false
    }
  }
}
```

**Per-source list-models implementation:**

| Source | Endpoint hit | Auth |
|---|---|---|
| pi-model-proxy | `GET http://localhost:9876/v1/models` | none |
| anthropic | `GET https://api.anthropic.com/v1/models` | configured `apiKey` |
| openai | `GET https://api.openai.com/v1/models` | configured `apiKey` |
| gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` | configured `apiKey` |
| openai-compatible | `GET <baseUrl>/models` | configured `apiKey` (sometimes optional) |

**Tool-capability filter:** Honcho requires tool calling. A response is filtered to tool-capable models using:

1. The provider's own capability flags when they exist (some `/models` endpoints expose `supports_tools` or capability arrays).
2. The plugin's bundled `TOOL_CAPABILITY_MAP` — a static mapping of `(provider, modelId)` → `supportsTools`. Maintained in the plugin's source under `src/llm/capability-map.ts` and updated with each release.

The map covers known families:
- Anthropic: all `claude-3*`, `claude-4*`, `claude-haiku-*`, `claude-sonnet-*`, `claude-opus-*` support tools.
- OpenAI: `gpt-4*`, `gpt-4o*`, `gpt-4-turbo`, `gpt-3.5-turbo-1106` and later support tools.
- Gemini: `gemini-1.5*`, `gemini-2*`, `gemini-2.5*` support tools.
- pi-model-proxy: trusted to only expose tool-capable models (its own filter).
- openai-compatible: assume all returned models support tools (user picked the endpoint deliberately).

Unknown models (newer than the plugin's release) default to `supportsTools=true` if the provider's own response says so, otherwise filtered out with a `notes: "capability unknown to plugin"` flag.

**Caching:**

- Per-source TTL: 5 minutes.
- Cache stored in plugin server memory (lost on dashboard restart — no persistence; first call after restart re-fetches).
- `POST /api/plugins/honcho/models/refresh` busts the cache for all sources, or `?source=<source>` for one.
- Settings panel surfaces a small refresh button next to the dropdown.

**Bundled fallback list:**

- Plugin ships a `BUNDLED_MODELS` map per source (e.g. `BUNDLED_MODELS.anthropic = [{ id: "claude-haiku-4-5", ... }, ...]`).
- When the live `/models` call fails (network error, 401, timeout), the response uses the bundled list with `stale: true`.
- The bundled list is updated by hand on plugin releases. Stale-list use is a degradation, not silent fallback — the settings panel shows a small "using bundled list" pill.
- pi-model-proxy has no bundled list (proxy must be reachable for that source to be usable at all).

**Aggregate semantics for the dropdown:**

- Dropdown shows every model from every available source, grouped by source, sorted by a heuristic (Haiku/Flash/cheap models first, Sonnet/standard middle, Opus/heavy last).
- A model that's reachable via N sources appears in N groups (e.g. `claude-haiku-4-5` shows under both pi-model-proxy and Anthropic direct if both are configured).
- The plugin's preferred-route logic (D11) sets the *default* selection but the user can pick any group's entry.
- Models from disabled sources (no API key set, proxy not reachable) are dimmed with an inline action to enable that source (e.g. "Add Anthropic API key" inline).

**Settings UX:**

```
LLM model: [🔍 Search models...                               ▾]
             │
             └─ dropdown opens to:
                ─ via pi-model-proxy (5 models)
                    anthropic/claude-haiku-4-5     [proxy]
                    anthropic/claude-sonnet-4-5    [proxy]
                    openai/gpt-4o-mini             [proxy]
                    google/gemini-2.5-flash        [proxy]
                ─ via Anthropic direct (3 models)  ✓ key set
                    claude-haiku-4-5               [direct]
                    claude-haiku-3-5-20241022      [direct]
                ─ via OpenAI direct                ⚠ no key
                    [Add OpenAI API key]
                ─ via Gemini direct                ⚠ no key
                    [Add Gemini API key]
                ─ via OpenAI-compatible (custom)
                    [Configure base URL]

Selected: anthropic/claude-haiku-4-5
Route:    [via pi-model-proxy           ▾]   ← secondary; hidden when one route
                                              ↑ dropdown lets user switch route
```

Alternatives considered:

- **Per-source models endpoint** (`GET /api/plugins/honcho/models?source=X`). Rejected for v1 — simpler endpoint but loses the aggregate-view benefit. The aggregate endpoint can be filtered client-side trivially.
- **Live every render** (no cache). Rejected — hits user's API keys with redundant calls and adds 100-300 ms per settings-panel mount.
- **Strict capability filter** (only models we explicitly know support tools). Rejected — would hide newer models. The default-to-true-on-unknown rule with a `notes` flag is more user-friendly.
- **Generic dashboard `/api/models` aggregator** (third option in the user-facing question). Acknowledged as out of scope for this proposal; logged in Open Questions for a follow-up.

## Risks / Trade-offs

- **Docker daemon unavailable but `mode=self-host` set** → Surface `state=docker-missing` in plugin status, render install-Docker callout in the Server section. Do not silently fall back to cloud — the user explicitly chose self-host.
- **Port 8000 / 5432 already in use** → Detect via `docker compose up` exit code and surface `state=port-conflict` with the conflicting port. Allow override via advanced section (`selfHost.apiPort`, `selfHost.dbPort`); regenerate compose template into `~/.honcho/docker-compose.yml.regenerated` and prompt the user to merge — never auto-overwrite a customised compose file.
- **Mid-write race between extension and plugin on `~/.honcho/config.json`** → All plugin writes use atomic temp-file + rename. The extension reads at session start and on `/honcho:setup` / `/honcho:sync`; concurrent reads will see either the pre- or post-write file, never a torn one.
- **Plugin auto-start triggers on every dashboard restart** → Compose `up -d` is idempotent. We accept the ~200 ms overhead on each restart vs. tracking a per-process "is-already-up" cache.
- **Auto-applied alembic migration on first boot** → Migration is gated by `selfHost.migrationsApplied` flag. Errors surface in plugin status; user can re-run `POST /server/restart` after fixing. We do not wrap migrations in transactions — alembic owns that.
- **Two-package version skew** → If the dashboard plugin pins a Honcho SDK version and the extension pins a different one, both ship to `~/.honcho/config.json` happily, but if the SDK adds new config fields the older package may strip them. Mitigation: plugin write helper preserves unknown keys (deep-merge, not replace).
- **Apikey leak via plugin config endpoint** → `GET /config` always redacts, returning `apiKeySet: boolean` + `apiKeyMasked: string`. POSTs with empty `apiKey` field preserve the stored secret. Audit-logged via the plugin runtime's standard scoped logger.
- **Honcho image tag drift** → Compose template pins `:latest` initially, which is the wrong choice long-term. Day-2 task: migrate to a pinned tag (`v3.x.y`) and document the upgrade procedure. Tracked as an open question, not a blocker.
- **Sessions map mutation order** → Per-card `[Map name]` saves are serialised through the same atomic write helper. Two simultaneous saves on different cards merge cleanly (different `cwd` keys).
- **Detection latency for newly installed extension** → After clicking "Install pi-memory-honcho" the dashboard's package-install endpoint returns success but the running pi sessions need a reload to register the extension. Plugin polls `/api/packages/installed` once on focus; per-card slots reappear next tick. Document the reload requirement in the install-success toast.
- **Migration failure during alembic** → Container stays up but API endpoints 500. Plugin status surfaces `state=offline` with `lastError` from `GET /health`. User can run `POST /server/restart` after manual `docker compose exec api alembic ...`.
- **External repo discoverability** → Users must know the package id to install. Mitigation: document `pi-dashboard plugin install pi-memory-honcho-dashboard` in the dashboard's plugin docs and add to a recommended-plugins list in this repo (one-line entry only).
- **Bind-mount perf penalty on macOS/Windows** with default `storageBackend="host-directory"` → surfaced in the settings panel via a small note next to the storage selector. Users who hit it can switch to `docker-volume` (data leaves the home directory) without losing their config.
- **`pgdata` directory permissions** → Postgres in the official `pgvector/pgvector:pg16` image runs as UID 999 by default. A bind mount whose host parent is owned by a different UID will trip Postgres at start. Mitigation: plugin creates `~/.pi-dashboard/honcho/pgdata/` with mode `0700` and detects the container user UID via `docker inspect` on first run; if there's a mismatch, surface as `state=offline` with `lastError` documenting the chmod/chown the user can run.
- **Backend switch on a running stack** → a config write that changes `storageBackend` while the stack is up could lead to data being written to one backend and reads from another. Mitigation: `POST /config` returns 409 if the stack is running and `storageBackend` differs from the current value. User must stop the stack first.
- **`loop-image` stub temptation** → we expose `loop-image` in the type so it shows up in the settings UI, but the v1 implementation returns a structured "not implemented" error. Risk: users select it, see an error, and report a bug. Mitigation: settings panel renders the loop-image option as `(coming in v0.3 — Linux only)` and disables the radio.
- **Port 8765 / 5455 still collidable** → chosen because they're unused by pi/dashboard/proxy stack today, but a user can absolutely have something else on 8765. Mitigation already in place: port-conflict detection sets `state=port-conflict` and the user can override via `selfHost.apiPort` / `selfHost.dbPort`. Default change just shifts the *probability* of collision down significantly.
- **pi-model-proxy availability racing with dashboard boot** → If the dashboard auto-starts the Honcho stack before pi-model-proxy's pi-bridge has registered the proxy listener, Honcho's first dialectic call 502s. Mitigation: plugin waits for `GET http://localhost:9876/v1/models` to return 200 before transitioning `state` past `starting`. If still unreachable after a 30 s budget, surface as `state=offline` with `lastError="pi-model-proxy not reachable on localhost:9876"`.
- **`host.docker.internal` not resolvable on rootless Docker / podman / non-Desktop Linux Docker** → The compose template adds `extra_hosts` which works for the standard Docker Engine case. Rootless Docker may require additional config. Mitigation: doctor preflight includes a `docker exec api curl http://host.docker.internal:9876/health` probe and surfaces a clear error if it fails, with a documented manual fix (use the host's actual LAN IP).
- **LLM-source switch silently breaks running sessions** → Honcho's running container caches `LLM_*` env at process start; changing `selfHost.llm.source` while running and applying it requires a container restart. Mitigation: 409 on switch-while-running (matches `storageBackend` contract). User must `POST /server/stop` first.
- **Model dropdown empty when proxy is up but pi has no models** → If pi has no logged-in providers, `GET /v1/models` returns `[]`. Mitigation: settings panel renders an empty dropdown with a helper text "No models available in pi-model-proxy. Log into a provider via pi or pick a different LLM source."
- **Stale bundled fallback list** → The bundled `BUNDLED_MODELS` map ages between plugin releases. A user might select a deprecated model. Mitigation: dropdown surfaces the `stale: true` indicator + plugin warns at stack-start when the resolved model id isn't in the live `/models` response. Honcho itself will fail at first dialectic call if the model is truly gone, which surfaces as `state=offline` with the upstream error.
- **list-models call rate-limits the user's API key** → 5-min TTL caches the response, plus the manual-refresh button is the only way to bypass. Concurrent-render protection: only the *plugin server* hits the upstream (clients call `/api/plugins/honcho/models`), so rate-limit pressure is per-dashboard, not per-renderer-mount.
- **Model id collision across routes** → `claude-haiku-4-5` exists both via pi-model-proxy (as `anthropic/claude-haiku-4-5`) and via Anthropic direct (as `claude-haiku-4-5`). The plugin treats these as distinct (different `(source, model)` pairs) but the dropdown UI must handle the rendering. Mitigation: the dropdown key is `<source>:<model>` internally; `selfHost.llm.model` stores the upstream id (without `<source>:` prefix) so Honcho's compose env is correct.
- **Tool-capability false negative** → The bundled `TOOL_CAPABILITY_MAP` may say a tool-capable model doesn't support tools (e.g. plugin pre-dates a new family). Mitigation: unknown models default to `supportsTools=true` when the provider's own response says so. Plugin maintainers update the map on each release.

## Migration Plan

This is a new external package — no in-repo migration. Rollout:

1. Publish v0.1.0 of `pi-memory-honcho-dashboard` (cloud-mode complete, self-host stubs return `not-implemented`).
2. Publish v0.2.0 with self-host docker-compose lifecycle.
3. Add a row to the dashboard's recommended-plugins list pointing at the new package.
4. Rollback: remove from the user's plugin list (`pi-dashboard plugin remove pi-memory-honcho-dashboard`); the `pi-memory-honcho` extension is unaffected and continues to function via TUI.

## Open Questions

- **Honcho image pin policy** — `:latest` for v0.2 or pin upfront? Affects upgrade story.
- **Where does the plugin live in this repo?** — User picked "external repo on npm", so source lives outside this monorepo. Do we still keep the change history (this proposal) here? (Yes — it documents the integration contract from the dashboard side.)
- **Linked-hosts UI** — current scope is CSV input. Worth a richer editor (per-host workspace + aiPeer) in a follow-up?
- **Custom tool-renderer for honcho_*** — explicitly deselected, but worth revisiting once cloud-mode users have feedback. Low risk to add later (additive `tool-renderer` claim).
- **`loop-image` backend implementation** — deferred to a follow-up (v0.3). Open: does it ship as a Linux-only feature flag, or do we attempt to vendor `hdiutil`-based equivalent on macOS? The latter triples the surface area and is probably not worth it.
- **Compose-file consolidation** — currently the compose file lives at `~/.honcho/docker-compose.yml` while persistence lives at `~/.pi-dashboard/honcho/pgdata/`. Should the compose file move to `~/.pi-dashboard/honcho/docker-compose.yml` for consistency? Defer to a future change — moving the compose file would require migration logic for users who already have one in place.
- **Generic dashboard `/api/models` aggregator** — plugin-local `GET /api/plugins/honcho/models` is the v1 answer. A future change should expose a dashboard-level aggregator so other plugins / OpenSpec / chat all consume the same model registry. Open: should the Honcho plugin's endpoint forward to a future generic one, or duplicate the logic and migrate later?
- **Per-task model overrides** — Honcho lets you pick a different model per task (`DIALECTIC_MODEL` vs `EMBEDDING_MODEL` vs `SUMMARY_MODEL`). The config type already has `embeddingModel` / `summaryModel` / `deriverModel` fields but the settings UI only exposes the primary model picker in v1. Open: how rich should the advanced-overrides UI be?
