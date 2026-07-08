## Why

Flow agent nodes (pi-flows) and `Agent`-tool sub-agents (pi-dashboard-subagents) spawned by a dashboard session **cannot use a custom provider** — one defined in `~/.pi/agent/providers.json` (e.g. `home-proxy`). The spawn fails at model/auth time with:

```
No API key found for <custom-provider>.
Use /login to log into a provider via OAuth or API key.
```

This reproduces today: `providers.json#roles` maps `@fast`/`@coding`/`@planning`/`@research`/`@compact` all to `home-proxy/cc/claude-haiku-4-5-20251001`, so every agent node in `invoice-bot`'s `invoicebot:process` flow hits a custom provider and fails.

**This supersedes the change's original diagnosis.** The earlier hypotheses — "pi 0.80 removed the catalog helper", "the `session_start` registry capture misses in headless RPC", "pi-flows passes a stale/undefined registry" — are all **disproven by runtime probe** (design.md §Corrected root cause). The model-catalog resolution fix they motivated already exists in `execution.ts` and does not address this failure, which is about **custom-provider auth propagation**, not model-catalog lookup.

**Verified root cause (two independent gaps):**

1. **A registration race in the dashboard.** Custom-provider auth lives only in a `ModelRegistry`'s in-memory `providerRequestConfigs`, populated by `pi.registerProvider`. The dashboard's `registerEntry` calls `pi.registerProvider` **only after `await discoverModels()`** — an HTTP GET to the provider's `/v1/models` with a 10 s timeout. A dashboard-spawned headless worker, driven by an automation prompt, starts a flow and spawns agents inside that window, before the parent registry has the auth. Errors are hidden by `activate()`'s `.catch(() => {})`.
2. **pi-dashboard-subagents discards the inheritance seam.** Its `createAgentSession` call passed neither `modelRegistry` nor `authStorage`, so each sub-agent built a **fresh disk registry** that never sees custom providers — failing even when the parent registry is correct. (pi-flows already passes `options.modelRegistry`, so flows only need gap #1 fixed.)

## What Changes

- **Dashboard: register custom-provider auth synchronously, before discovery.** `activate()` calls a new `preRegisterProviderAuth(pi, name, entry)` for each provider before the fire-and-forget `registerEntry`, storing `providerRequestConfigs[name] = { apiKey }` the instant the session starts. `models` is omitted (optional), so the existing catalog is untouched; `registerEntry` still adds discovered models once `/v1/models` resolves. Spawned flow/subagent sessions inherit this session's registry, so auth is present before any spawn.
- **Dashboard: make `registerEntry` failures observable.** `activate()`'s blanket `.catch(() => {})` is replaced with a logged catch, so a failed registration is diagnosable instead of silent.
- **pi-dashboard-subagents: pass the parent registry into spawns.** `createAgentSession` now receives `modelRegistry: ctx.modelRegistry` and `authStorage: ctx.modelRegistry.authStorage`, matching the seam pi-flows already uses. The sub-agent inherits every provider registered on the parent — including custom ones.
- **No change to the `model:resolve` contract, `@role` interpretation, or `providers.json` ownership. No pi-flows change** (its pass-through is already correct).

## Capabilities

### New Capabilities
- `flow-agent-provider-propagation`: custom providers registered in a dashboard session reach the flow-agent and sub-agent sessions it spawns, so agent nodes authenticate against custom providers without a per-agent re-login.

### Modified Capabilities
<!-- none -->

## Impact

- **Repos (multi-repo change):**
  - `pi-agent-dashboard` — `packages/extension/src/provider-register.ts`: `preRegisterProviderAuth` (sync auth registration) + loud `registerEntry` failures. Tests in `__tests__/provider-register-reload.test.ts`.
  - `pi-dashboard-subagents` — `extensions/agent.ts`: pass `modelRegistry` + `authStorage` into `createAgentSession`.
- **Behavior:** flow agent nodes and sub-agents resolve AND authenticate custom providers in dashboard-spawned sessions; no user-facing config change; `providers.json` untouched.
- **Backward compatibility:** additive. `preRegisterProviderAuth` omits `models`, so it never clears a catalog; `reloadProviders` and `session_start` paths are unchanged (pre-reg is scoped to `activate()`). The subagents change passes existing session state through unchanged when `ctx.modelRegistry` is absent.
- **Out of scope:**
  - Option B (propagate the already-resolved `probe.auth`) — needs an upstream pi-coding-agent per-session auth override that does not exist today; flagged upstream.
  - Option D (upstream pi carrying runtime providers into `createAgentSession`) — a pi-coding-agent / pi-ai change.
  - The stale model-catalog resolution work (Stage-1 `Model` reuse, `resolveModelObject`) — already landed in `execution.ts`; not re-implemented here.
