# Tasks

## 1. Dashboard: sync auth pre-registration + loud failures

- [x] 1.1 Add `export function preRegisterProviderAuth(pi, name, entry)` to `packages/extension/src/provider-register.ts` — calls `pi.registerProvider(name, { baseUrl, apiKey: toRegisterApiKey(entry.apiKey), api })` with `models` OMITTED, wrapped in a logged try/catch.
- [x] 1.2 Call `preRegisterProviderAuth(pi, name, entry)` in the `activate()` provider loop, before the fire-and-forget `registerEntry(...)`.
- [x] 1.3 Replace `activate()`'s `registerEntry(...).catch(() => {})` with a logged catch (`console.error("[dashboard] registerEntry(<name>) failed …")`).
- [x] 1.4 Leave `registerEntry`, `reloadProviders`, and the `session_start` re-registration unchanged (pre-reg scoped to `activate()` so their single-call contracts hold).

## 2. pi-dashboard-subagents: inherit the parent registry

- [x] 2.1 In `extensions/agent.ts`, pass `modelRegistry: ctx.modelRegistry` and `authStorage: ctx.modelRegistry.authStorage` into the `createAgentSession(...)` call (guarded spreads; type-clean, no cast). *(applied by the user)*

## 3. Tests

- [x] 3.1 Dashboard unit: `preRegisterProviderAuth` registers the apiKey with NO `models` (one call; `config.models` undefined).
- [x] 3.2 Dashboard unit: `activate()` emits the auth-only pre-registration first, then the fallback-enriched `registerEntry` call (2 calls), then the catalog-enriched call after `session_start` (3rd).
- [x] 3.3 Existing `reloadProviders` + `session_start` suites stay green (single-call contract unchanged).
- [x] 3.4 pi-dashboard-subagents type check: `createAgentSession` receives `modelRegistry`/`authStorage` (guarded spreads); `tsc --noEmit` clean.

## 4. Validate

- [x] 4.1 `npm test` (provider-register suites) green in the dashboard repo.
- [x] 4.2 Typecheck clean in both repos (no new errors from these changes).
- [x] 4.3 E2E smoke: N/A in CI — custom-provider (`home-proxy`) e2e cannot run without the live proxy + credentials. Verified by unit tests (pre-reg stores auth before discovery) + code trace (child inherits parent registry). Manual smoke deferred to the operator's environment.

## 5. Flag out-of-scope follow-ups

- [x] 5.1 Upstream ask (Option D) noted in proposal/design out-of-scope: pi-coding-agent carrying runtime-registered providers into `createAgentSession`.
