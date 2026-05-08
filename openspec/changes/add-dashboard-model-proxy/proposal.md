## Why

External services (Honcho memory store, LangChain workers, CI test harnesses, custom apps) need a stable, always-on HTTP endpoint that exposes the same set of LLM models the dashboard's `/model` selector shows — without requiring those clients to manage their own provider credentials, OAuth tokens, or pi installations.

The upstream extension `@blackbelt-technology/pi-model-proxy` solves a similar problem but is **session-scoped**: its HTTP server starts on extension load and dies on `session_shutdown`. Two pi sessions cannot both bind `:9876` (`EADDRINUSE`); zero pi sessions means no proxy. That lifecycle is wrong for the "always available while the dashboard runs" requirement (see explore-mode discussion 2026-05-01).

Adding `/v1/...` routes to the dashboard server itself gives us:
- Lifetime tied to the dashboard daemon (already an always-on process), not to any pi session.
- Concurrent-client support gated by Fastify, not by single-process binding.
- Identity-verified auth via the existing OAuth/JWT layer plus a new API-key surface for non-browser clients.
- Tunnel passthrough — the existing zrok integration exposes `/v1/...` for free.
- A single source of truth for "which models are available": dashboard settings + `~/.pi/agent/auth.json`, exactly what the `/model` selector reads.

The dashboard already reads `~/.pi/agent/{auth,providers,models}.json` directly (via `provider-auth-storage.ts`, `provider-routes.ts`, `provider-catalogue-cache.ts`) and already has its own writer for `auth.json` (OAuth-flow completion in `provider-auth-storage.ts`). We therefore do NOT pull in pi-coding-agent's `ModelRegistry`/`AuthStorage` for the proxy — we build a small in-house registry over pi-ai's primitives, reusing the dashboard's existing file-access path. This keeps the proxy's runtime dependency surface to one package (`pi-ai`, ~5 MB, 11 SDK transitives, the actual LLM HTTP/SSE machinery) instead of two (pi-coding-agent's ~175 MB agent runtime plus pi-ai). It also collapses the "two separate writers to `auth.json` with different lock conventions" smell that a pi-coding-agent-backed AuthStorage would introduce.

## What Changes

- **NEW capability**: `model-proxy` — OpenAI Chat Completions–compatible (`POST /v1/chat/completions`) and Anthropic Messages–compatible (`POST /v1/messages`) endpoints, plus `GET /v1/models`, mounted on the dashboard server.
- **NEW server module** `packages/server/src/model-proxy/` containing:
  - `internal-registry.ts` (~50 lines) — in-house `ModelRegistry` analogue. Reads `~/.pi/agent/{auth,providers,models}.json` directly (via existing `provider-auth-storage.ts` + `provider-routes.ts` helpers), composes with pi-ai's `register-builtins` output, exposes `getAvailable()`, `find(provider, modelId)`, `getApiKeyAndHeaders(model)`, `refresh()`, `getAll()`. Replaces what we would have used `pi-coding-agent`'s `ModelRegistry` for.
  - `internal-auth-storage.ts` (~70 lines) — OAuth refresh wiring on top of the existing `provider-auth-storage.ts`. On `getApiKeyAndHeaders()` if the cached OAuth token is expired, it calls pi-ai's per-provider OAuth refresh helper (e.g. `pi-ai/oauth#refreshAnthropicToken`), then writes the new token via `provider-auth-storage.ts#writeCredential` under its existing lock. Replaces what we would have used `pi-coding-agent`'s `AuthStorage` for.
  - `registry-singleton.ts` — boot-time singleton wiring `internal-registry` + `internal-auth-storage` + the runtime-resolved `pi-ai` module. Refreshable on credential / providers.json / models.json change.
  - `convert/` — bidirectional format translation (OpenAI ↔ pi-ai event stream ↔ Anthropic). Lifted with attribution from upstream `@blackbelt-technology/pi-model-proxy/src/convert/` (MIT).
  - `streamer.ts` — thin wrapper around `pi-ai`'s `streamSimple` (resolved via the registry) with `AbortSignal` propagation on client disconnect.
  - `auth-gate.ts` — Fastify hook that accepts a dedicated proxy API key (uniform; not the dashboard JWT — see design.md Decision 2).
- **NEW REST routes**: `POST /api/model-proxy/api-keys`, `POST /api/model-proxy/api-keys/:id/revoke`, `DELETE /api/model-proxy/api-keys/:id`, `GET /api/model-proxy/api-keys` for managing proxy-scoped bearer tokens. API keys are stored hashed in `~/.pi/dashboard/config.json#modelProxy.apiKeys` (each entry: `{id, label, createdBy, scopes, createdAt, lastUsedAt?, expiresAt?, revokedAt?, hash}`). Management routes are dashboard-JWT-gated.
- **NEW config schema** in `packages/shared/src/config.ts`: `modelProxy: { enabled: boolean; defaultModel?: string; secondPort?: number; maxConcurrentStreams: number; perKeyConcurrentStreams: number; perProviderCaps?: Record<string, number>; logRequests: boolean; apiKeys: ProxyApiKey[] }`. Default `enabled: true` — but `/v1/*` enforces uniform API-key auth regardless of source (loopback rules do not apply; see design.md Decision 2).
- **Runtime module resolution — single dependency, no new build-time deps.** `packages/server/package.json` is unchanged.
  - `pi-ai` is the only runtime-resolved module the proxy needs. It is registered as a NEW module-kind tool in `packages/shared/src/tool-registry/definitions.ts` (single alias `@mariozechner/pi-ai`, entry `dist/index.js`). Bootstrap-install populates it into `~/.pi-dashboard/node_modules/` (already a transitive dep of pi-coding-agent today; if npm fails to hoist, an explicit entry in the install list is the fallback — see tasks.md §2.7).
  - **`pi-coding-agent` is NOT a dep of the proxy.** Its existing module-kind registration (used by `package-manager-wrapper.ts`) is unrelated and unchanged. The proxy never imports `ModelRegistry` or `AuthStorage` from it.
  - The proxy depends on these pi-ai surfaces, all stable public exports: `streamSimple` (the upstream HTTP/SSE call), `register-builtins` (built-in provider table), `MODELS` (model catalog), `oauth.ts` per-provider refresh helpers, `transform-messages.ts`, `Model<Api>` types.
  - This preserves the dashboard's thin-server architecture and shrinks the proxy's runtime footprint to ~5 MB (pi-ai + its 11 SDK transitives) instead of ~180 MB (pi-coding-agent + pi-ai).
- **NEW client surface** in `packages/client/src/components/ModelProxySection.tsx` (settings panel): toggle, default-model dropdown, optional second-port input, API-keys table with create/reveal-once/revoke actions.
- **NEW recursion guard**: refuse to register a custom provider in `~/.pi/agent/providers.json` whose `baseUrl` resolves to the dashboard's own listen address. Surfaces as an error in the existing provider-routes.ts PUT handler.

## Capabilities

### New Capabilities

- `model-proxy` — defines the wire contract (`/v1/models`, `/v1/chat/completions`, `/v1/messages`), the auth model (proxy API key only — no JWT, no bypass inheritance), the credential-resolution semantics (server-resident in-house registry over pi-ai primitives), the streaming contract (SSE pass-through, AbortSignal on disconnect), and the recursion-guard requirement.

### Modified Capabilities

- `auth` (existing) — extended to accept proxy API keys for `/v1/*` routes only. Dashboard JWT continues to work everywhere; proxy API keys are scoped to the proxy surface.
- `model-selector` (existing, untouched) — clarifying note that `/v1/models` returns the same effective set as the in-session `/model` dropdown (both compose `auth.json` + `providers.json` + `models.json` over pi-ai's built-ins; the proxy's `internal-registry` and pi sessions' `ModelRegistry` agree by construction).

## Impact

- `packages/server/package.json` — **unchanged** (no new dependencies). `pi-ai` is runtime-resolved through the existing `ToolRegistry`.
- `packages/shared/src/tool-registry/definitions.ts` — register `pi-ai` as a new module-kind tool (single alias `@mariozechner/pi-ai`, entry `dist/index.js`).
- **NEW** `packages/server/src/model-proxy/internal-registry.ts` — in-house registry composing `~/.pi/agent/{auth,providers,models}.json` with pi-ai's built-ins. ~50 lines.
- **NEW** `packages/server/src/model-proxy/internal-auth-storage.ts` — OAuth refresh wiring on top of `provider-auth-storage.ts`. ~70 lines.
- `packages/server/src/provider-auth-storage.ts` — expose its read/write helpers (`readAuthJson`, `writeCredential`) for `internal-auth-storage.ts` to compose. Optionally upgrade its `mkdir`-based lock to `proper-lockfile` to match pi sessions' lock convention; orthogonal but recommended.
- `packages/server/src/server.ts` — register `model-proxy-routes` after auth plugin, before catch-all 404. Lazy-init the registry singleton on first request.
- `packages/server/src/routes/provider-routes.ts` — add recursion guard in `PUT /api/providers` to reject self-pointing custom providers.
- `packages/server/src/auth-plugin.ts` — register the proxy `onRequest` hook ahead of the existing JWT hook, scoped to `/v1/*` paths only. Existing routes' bypass rules unchanged.
- `packages/shared/src/config.ts` — extend `DashboardConfig` with `modelProxy` block, add `parseModelProxyConfig` validator.
- `packages/shared/src/rest-api.ts` — add types for `/api/model-proxy/api-keys/*` routes and the OpenAI/Anthropic wire shapes.
- `packages/client/src/components/SettingsPanel.tsx` — mount new `ModelProxySection`.
- `packages/client/src/lib/model-proxy-api.ts` — fetch helpers for the new REST surface.
- `AGENTS.md` + `README.md` + `docs/architecture.md` — document the new `/v1/*` surface, the API-key model, the recursion guard, the in-house registry rationale (why pi-coding-agent is NOT a dep), and the single-writer auth.json contract.
- **No upstream pi-model-proxy code is replaced or deprecated** — that extension continues to work for users running pi standalone without the dashboard. Users who run both will likely disable the upstream extension to avoid duplicate listeners; documented as a coexistence note, not enforced.

## References

- Explore-mode discussion: 2026-05-01 conversation; rewrite consolidating Option C: 2026-05-07.
- Upstream pi-model-proxy: https://github.com/BlackBeltTechnology/pi-model-proxy (MIT) — source of `convert/` lift.
- pi-ai exports the proxy uses: `@mariozechner/pi-ai/dist/index.d.ts` — `streamSimple`, `Model<Api>`, `MODELS` table, `register-builtins`, OAuth refresh helpers (Anthropic / Codex / Gemini-CLI / GitHub Copilot / Antigravity), `transform-messages`.
- Existing dashboard file readers/writers reused by `internal-registry`/`internal-auth-storage`:
  - `packages/server/src/provider-auth-storage.ts` — reads/writes `~/.pi/agent/auth.json` (lockfile + atomic write) for OAuth-flow completion.
  - `packages/server/src/routes/provider-routes.ts` — reads/writes `~/.pi/agent/providers.json`.
  - `packages/server/src/provider-catalogue-cache.ts` — bridge-pushed catalogue; remains the source for `/api/provider-auth/status` and is independent of the proxy.
- Runtime-resolution machinery:
  - `packages/shared/src/tool-registry/definitions.ts` — module-kind registration (this change adds `pi-ai`).
  - `packages/shared/src/tool-registry/strategies.ts` — `bareImportStrategy`, `managedModuleStrategy`, `npmGlobalStrategy`.
  - `packages/server/src/package-manager-wrapper.ts` — reference implementation of `registry.resolveModule<T>(name)` followed by typed module access (uses pi-coding-agent for its own purposes, NOT the proxy).
  - `packages/server/src/bootstrap-install-from-list.ts` — installs pi-coding-agent into `~/.pi-dashboard/node_modules/` on first run; `pi-ai` rides along as a transitive (npm-hoisted), or is added as an explicit entry.
- Existing auth surface: `packages/server/src/auth-plugin.ts`, `packages/server/src/auth.ts`.
- Why we do NOT use pi-coding-agent for the proxy: design.md §Decisions §1. Short version: ~50 lines of in-house composition + ~70 lines of OAuth-refresh wiring on the dashboard's existing `auth.json` writer is cheaper than carrying a 175 MB agent runtime we don't otherwise need, and it eliminates the "two writers with different lock conventions on one file" smell.
- Related but distinct capability: `model-selector` (per-session `/model` UI), `ui-proxy` (extension UI mount points — unrelated despite the name).
