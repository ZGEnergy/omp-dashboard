## Context

A dashboard session spawns flow-agent nodes (pi-flows) and `Agent`-tool sub-agents (pi-dashboard-subagents) **in-memory** via `createAgentSession(...)`. Agent `model:` refs are `@role` values resolved through `providers.json#roles` to custom-provider literals (`home-proxy/cc/…`). The spawn fails at auth time with `No API key found for <provider>`.

Source of truth for this analysis: `custom-provider-spawned-session-issue.md` (runtime-probed this session). Claim tags: **[VERIFIED]** = runtime probe or clean code read; **[FROM pi dist]** = read from compiled `@earendil-works/pi-coding-agent`; **[INFERRED]** = reasoned from those.

### Corrected root cause (runtime-verified — supersedes the change's original diagnosis)

1. **Registry capture does NOT miss in headless RPC. [VERIFIED]** A probe in pi-flows' `activate()` against real dashboard-spawned headless `invoice-bot` sessions (4 spawns) showed `ctx.modelRegistry` present at `session_start`, live (has `registerProvider`), and captured as the SAME instance (`sameInstance:true`), stable at +6s/+15s. The original D2 hypothesis ("session_start capture misses") is FALSE.
2. **Model-catalog resolution is not the problem. [VERIFIED]** Built-in catalog models resolve fine; the stale-resolution fix (`resolveModelObject`, Stage-1 `Model` reuse) is already in `execution.ts` and does not touch this failure.
3. **The captured registry contains only the ~30 built-in pi-ai providers. [VERIFIED]** `home-proxy`/`bb-proxy` are absent — `find` misses, `getAll` has none — even though `provider-register` is in the global `packages` list and its `model:resolve` handler demonstrably runs in that session (role resolution works).
4. **Custom providers are in-memory, per-registry, non-propagating. [FROM pi dist]** `pi.registerProvider` → `runner.modelRegistry.registerProvider`, storing two independent things: model catalog AND `providerRequestConfigs` (the auth map). `createAgentSession` builds `modelRegistry = options.modelRegistry ?? ModelRegistry.create(...)`. Request-time auth uses `getApiKeyAndHeaders(model)`: for a custom provider the key comes ONLY from `providerRequestConfigs` (not `authStorage`). A spawned registry without that entry ⇒ `No API key found for <provider>`.
5. **pi-flows spawns a stripped extension set. [VERIFIED, execution.ts]** `extensionFactories = [createGuardExtension(...), ...(options.extraAgentExtensions ?? [])]`. `provider-register` is NOT in it, so `pi.registerProvider` never runs on the spawned session's registry. pi-flows DOES pass `modelRegistry: options.modelRegistry` (the parent's captured instance) — but the probe (item 3) shows that instance itself lacks the custom provider in the headless worker.

### The registration race (root cause, code-verified 2026-07-08)

`registerEntry` (`provider-register.ts`) registers auth ONLY after the async discovery:

```
lastRegistered.set(name, …)              // sync (UI flag snapshot only)
const discovered = await discoverModels(baseUrl, apiKey)   // HTTP GET /v1/models, 10s timeout
…
pi.registerProvider(name, { …, models }) // ← providerRequestConfigs[name] set HERE, post-await
```

`activate()` calls `registerEntry(...).catch(() => {})` fire-and-forget per provider. So from session start until discovery resolves (up to 10 s; `home-proxy` is `http://localhost:20128/v1`, which may be slow/unreachable in a headless worker), the parent registry has NO `providerRequestConfigs[home-proxy]`.

**pi's registration semantics [FROM pi dist]:** `registerProvider → validateProviderConfig` early-returns on `models.length === 0` (no throw); `applyProviderConfig → storeProviderRequestConfig` stores `{ apiKey }` whenever the config carries an apiKey; the model-replacement branch is guarded by `models.length > 0`. So registering with `models` OMITTED stores auth WITHOUT touching the catalog. `toRegisterApiKey` preserves a literal key; `discoverModels` never throws (returns `[]`). ⇒ the ONLY reason the spawned registry lacks auth is that `registerProvider` hasn't run yet (the race) — not a throw, not empty discovery.

**Why the original probe saw an empty registry:** it measured the model surface (`find`/`getAll`), which is legitimately empty until discovery resolves. It did NOT measure `providerRequestConfigs` (the auth surface). The `.catch(() => {})` additionally hid any error. Both are addressed: pre-register auth synchronously (D2) and log failures (D3).

## Goals / Non-Goals

**Goals:**
- Flow-agent AND sub-agent sessions spawned by the dashboard authenticate against custom providers.
- Custom-provider auth (`providerRequestConfigs`) is present on the parent registry BEFORE any spawn (no discovery-window race).
- Sub-agents inherit the parent registry (pi-flows already does).
- pi-flows' guard/tool sandbox is unchanged (no provider factory injected; no new tools/commands).
- Registration failures are observable, not swallowed.

**Non-Goals:**
- No change to the `model:resolve` event contract, `@role` interpretation, or `providers.json` ownership.
- No fix to pi-dashboard-subagents (separate repo; flagged).
- No upstream pi-coding-agent change (Option B/D flagged upstream).
- No re-implementation of the already-landed model-catalog resolution work.

## Decisions

**D1 — Option C, not Option A: fix the parent registry + inheritance, do NOT inject a provider factory into spawned sessions.**
Spawned sessions inherit the parent's `ModelRegistry` instance (`createAgentSession` uses `options.modelRegistry ?? ModelRegistry.create()`; pi-flows passes it, and pi-dashboard-subagents now passes `ctx.modelRegistry`). So making the parent registry correct is sufficient — no need to re-run a registrar in the child.
*Alternatives considered:* (A) emit `flow:register-agent-extension { factory }` so the child re-registers providers — REJECTED: pi-flows builds child extensions via a FAKE minimal `ExtensionAPI` (`execution.ts:278`) whose `registerProvider` delegates to a throwaway runtime, NOT the session registry, so the factory could not reach the child's registry. Also unnecessary given inheritance. (B) propagate `probe.auth` — no supported per-session auth override in pi. (child pi process) — heavy, unviable for the parallel DAG.

**D2 — Register auth synchronously in `activate()`, before discovery (closes the race).**
A new `preRegisterProviderAuth(pi, name, entry)` calls `pi.registerProvider(name, { baseUrl, apiKey, api })` with `models` OMITTED, per provider, in the `activate()` loop BEFORE the fire-and-forget `registerEntry`. This stores `providerRequestConfigs` immediately (pi early-returns on empty models and skips catalog replacement), so the auth is present the instant the session starts — before any flow/subagent can spawn. `registerEntry` still runs and adds discovered models once `/v1/models` resolves.
Scoped to `activate()` only: `reloadProviders` (UI save) and the `session_start` re-registration keep single-call semantics (their tests unchanged).

**D3 — Make `registerEntry` failures observable.**
Replace the blanket `.catch(() => {})` in `activate()` with a logged catch (`console.error("[dashboard] registerEntry(<name>) failed …")`).

**D4 — pi-dashboard-subagents inherits the registry.**
`createAgentSession` receives `modelRegistry: ctx.modelRegistry` and `authStorage: ctx.modelRegistry.authStorage`. `ExtensionContext.modelRegistry` and `ModelRegistry.authStorage` are public typed surfaces (no cast). This is the sub-agent counterpart of pi-flows' existing pass-through.

## Risks / Trade-offs

- **Double registration per provider at activate() (pre-reg + registerEntry).** Mitigation: pre-reg omits `models`, so it only stores auth and never clears the catalog; the enrichment call sets models. Observable as 2 `registerProvider` calls at activate (test updated to encode this).
- **UI-flag flicker.** Mitigation: `models` omitted (not `[]`), so `upsertRegisteredProvider` preserves any existing catalog; no empty `models_list` push.
- **Sub-agent inherits a registry without a provider (parent race still open).** Mitigation: D2 removes the parent race, so the inherited registry has auth.
- **Secret handling:** no new secret surface — the apiKey is registered exactly as the existing `registerEntry` does; only the timing moves earlier.

## Migration Plan

1. Dashboard: add `preRegisterProviderAuth` + call it in the `activate()` loop before `registerEntry` (D2); make `registerEntry` failures loud (D3).
2. pi-dashboard-subagents: pass `modelRegistry`/`authStorage` into `createAgentSession` (D4).
3. Tests: dashboard unit (pre-reg stores auth, no `models`; activate() emits pre-reg + enriched); existing `reloadProviders`/`session_start` suites stay green.
4. E2E smoke: dashboard-spawned headless `invoice-bot` running `invoicebot:process` with `@fast`/`@coding`/`@planning` (all `home-proxy/…`) → agent nodes AND `Agent`-tool sub-agents run, zero `No API key found`.

Rollback: revert the `provider-register.ts` pre-reg/logging and the `agent.ts` pass-through; no persisted state or config touched.

## Open Questions

- Upstream: should pi-coding-agent expose a supported way to carry runtime-registered providers into `createAgentSession` (Option D)? Would fix all ecosystems at once — raise as an issue/PR.
