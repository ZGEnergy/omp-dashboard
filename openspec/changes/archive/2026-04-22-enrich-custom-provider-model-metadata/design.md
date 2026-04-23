## Context

The bridge extension (`packages/extension/src/provider-register.ts`) registers user-configured LLM providers from `~/.pi/agent/providers.json` at session start and on every `credentials_updated` event. For each provider it:

1. Fetches the provider's `/v1/models` endpoint (OpenAI-compatible discovery).
2. Maps each discovered `{id, owned_by}` entry into a model descriptor.
3. Calls `pi.registerProvider(name, { baseUrl, apiKey, api, models })`.

Step 2 prior to this change hardcoded every field except `id`:

```ts
const models = discovered.map((m) => ({
  id: m.id,
  name: m.id,
  reasoning: false,
  input: ["text", "image"],
  contextWindow: 200000,   // ← always 200k regardless of model
  maxTokens: 16384,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
}));
```

This was wrong for every real frontier model routed through proxies:

| Discovered id (via proxy) | True metadata | Previously registered |
|---|---|---|
| `cc/claude-opus-4-7` | 1M ctx, 128k maxTok, reasoning, $5/$25 | 200k, 16k, no reasoning, $0 |
| `anthropic/claude-sonnet-4-6` | 1M ctx, 64k maxTok, reasoning, $3/$15 | 200k, 16k, no reasoning, $0 |
| `openai/gpt-5` | 400k ctx, 128k maxTok, reasoning, $1.25/$10 | 200k, 16k, no reasoning, $0 |
| `gemini-2.5-pro` | 2M ctx, 65k maxTok, reasoning | 200k, 16k, no reasoning, $0 |

The upstream `/v1/models` schema (per OpenAI's spec, which every proxy copies) does not advertise `context_window`, `max_tokens`, `cost`, or `reasoning`. OpenRouter is the sole exception (emits `context_length`). We cannot rely on the remote endpoint for enrichment.

pi provides a `ModelRegistry` service that every extension receives in its spawn context. It indexes pi-ai's bundled catalog (`@mariozechner/pi-ai` → `MODELS`) plus every dynamically-registered custom model, and exposes a `find(provider, id)` method that returns the full model descriptor. Because `modelRegistry.find()` already composes the bundled catalog with user-configured models, it's a richer data source than importing pi-ai directly.

## Goals / Non-Goals

**Goals:**
- Replace the four hardcoded metadata fields (`contextWindow`, `maxTokens`, `reasoning`, `cost`) in `registerEntry()` with a registry-backed lookup that returns accurate values for any model pi's catalog knows about.
- Handle the common proxy-prefix pattern (`cc/`, `anthropic/`, `openrouter/openai/…`) by stripping the prefix before lookup.
- Preserve today's graceful-degradation posture: if the registry has no match, fall back to defensible defaults chosen *per api type*, not a flat 200k.
- Keep the existing `input: ["text", "image"]` default when the registry doesn't know the model — preserves the `### Requirement: Custom-provider models default to image-capable` contract established by `enable-image-input-custom-providers`.
- Unit-test the pure lookup helper exhaustively with fake probes; touch `registerEntry()` with a single call site change.
- Zero new dependencies.

**Non-Goals:**
- **Per-model user overrides in `providers.json`.** A future change can add `modelOverrides: { [id]: { contextWindow, … } }` if needed; out of scope here.
- **OpenRouter's `context_length` parsing.** Requires changes to `discoverModels`; different work.
- **Changing any built-in / OAuth provider.** `registerEntry` is only called for custom `providers.json` entries.
- **Persisting enriched metadata to disk.** Registration is per-process in-memory; recomputed every session start.
- **Telemetry on cache-miss rate** (how often fallbacks fire). Nice-to-have, not needed for correctness.
- **Importing `@mariozechner/pi-ai` directly.** Explicitly rejected — pi-ai is a transitive dependency of pi and not part of our managed surface. Using pi's `modelRegistry.find()` is the documented, stable API for this lookup.

## Decisions

### Decision 1: Use `modelRegistry.find(provider, id)` via pi's `ExtensionContext`, not a direct pi-ai import

**Choice:** The bridge extension obtains a reference to pi's `ModelRegistry` by reading `ctx.modelRegistry` from the `ExtensionContext` that pi passes to every event handler — specifically the `session_start` handler (and the `model_select` handler as a belt-and-suspenders fallback). The first reference seen is stored in a module-level `modelRegistryRef` and reused thereafter. It then passes `(p, id) => modelRegistryRef.find(p, id) ?? null` as the probe to `enrichModelMetadata`.

Because `activate()` registers providers (fire-and-forget) BEFORE any event handler fires, the first registration pass runs without a probe and uses fallback defaults. Once `session_start` fires, the handler captures the registry and **re-registers all known providers** — this time enriched. The re-registration is idempotent: `pi.registerProvider(name, config)` replaces the prior registration (per pi's `ModelRegistry.registerProvider` contract, which says "if provider has models: replaces all existing models for this provider").

**Alternatives considered:**
- **Import `getModel` from `@mariozechner/pi-ai` directly.** Rejected — pi-ai is not an explicit peer dependency of `packages/extension`, and adding it would (a) create an install footprint, (b) couple us to pi-ai's internal `MODELS` export shape, and (c) bypass any user-configured custom-model metadata pi has merged into its registry.
- **Emit a custom `flow:get-spawn-context` event on the extension event bus.** Rejected — that event is provided by the pi-flows extension, which is not installed in every environment. When pi-flows is absent, the emit is a no-op and `modelRegistry` stays `null`, defeating the enrichment. `ctx.modelRegistry` is a core pi API present in every extension's event-handler context, guaranteed by pi itself.
- **Hardcode per-model-family rules in the bridge** (e.g., `if id.includes("opus-4-7") return 1_000_000`). Rejected — duplicates pi's catalog and goes stale whenever new models ship.
- **Fetch model metadata from a remote registry (e.g., models.dev)** at session start. Rejected — requires network, adds session-start latency, introduces a third-party dependency.
- **Accept user-configured `modelOverrides` in `providers.json`** as the sole fix. Rejected — would make every user hand-author metadata for well-known frontier models. Worth adding later as an *override* layer on top of catalog enrichment.

**Rationale:** `modelRegistry.find()` is pi's public extension-facing lookup. It already combines pi-ai's bundled catalog with any dynamic providers pi has registered, which means:
- On a session where the user has a custom `custom-model-X` registered, the probe returns pi's merged view — not just the bundled slice.
- We ride whatever upgrades pi ships (new models, corrected metadata) with zero code changes on our side.
- Tests use fake probes built from a plain `Map`, so the helper is fully unit-testable without any pi runtime.

### Decision 2: Dependency-inject the catalog probe instead of calling the registry inline

**Choice:** `enrichModelMetadata` accepts an optional `probe?: CatalogProbe | null` parameter. The type is:

```ts
export type CatalogProbe = (provider: string, modelId: string) => {
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  input: readonly ("text" | "image")[];
} | null | undefined;
```

Production call:
```ts
const registry = getModelRegistry(); // returns module-level modelRegistryRef captured at session_start
const probe: CatalogProbe | null = registry?.find
  ? (p, id) => registry.find(p, id) ?? null
  : null;
const metadata = enrichModelMetadata(m.id, entry.api, probe);
```

Unit tests build `probe` from a `Map<string, CatalogEntry>` with no pi dependency.

**Alternatives considered:**
- **Call the registry inline inside the helper.** Rejected — would couple the pure lookup logic to pi's runtime and complicate testing.
- **Global mutable catalog module that tests reset between cases.** Rejected — leakage risk, worse isolation, harder to reason about.

**Rationale:** Inversion-of-control at the function boundary keeps the helper's logic testable, lets production wire a real registry, and degrades gracefully (falls back to api-appropriate defaults) when the registry isn't yet available (e.g., the extension registers providers *before* pi has fully populated the spawn context — the probe returns `null` and fallbacks apply).

### Decision 3: Probe api-appropriate candidate providers in a fixed order

**Choice:** The helper filters candidate provider names by the provider's `api` field, then probes each candidate in order:

```ts
const CANDIDATE_PROVIDERS: Record<string, readonly string[]> = {
  "anthropic-messages":    ["anthropic", "opencode"],
  "google-generative-ai":  ["google", "google-vertex"],
  "openai-completions":    ["openai", "openrouter", "groq", "xai", "mistral"],
};
```

First match wins.

**Alternatives considered:**
- **Probe every provider in `MODELS`.** Rejected — `anthropic.claude-opus-4-7` and `opencode.claude-opus-4-7` both exist with similar metadata; probing every provider may surface a wrong cost field first (e.g., an AWS Bedrock entry with different pricing). Api-appropriate filtering gives us deterministic picks.
- **Only probe the api's "home" provider** (e.g., only `anthropic` for `anthropic-messages`). Rejected — misses models whose canonical home is `opencode` in pi-ai's catalog.

**Rationale:** The api field is the strongest signal for which catalog subset is authoritative. A short ordered probe list keeps the lookup O(k·n) with k ≤ 5 providers and n ≤ 2 ids, both bounded and fast against an in-memory registry.

### Decision 4: Strip proxy prefixes before catalog lookup

**Choice:** Before probing, try both the full discovered id and the segment after the last `/`:

```ts
const lookupIds = [discoveredId];
const lastSlash = discoveredId.lastIndexOf("/");
if (lastSlash >= 0 && lastSlash < discoveredId.length - 1) {
  const bare = discoveredId.slice(lastSlash + 1);
  if (bare && bare !== discoveredId) lookupIds.push(bare);
}
```

Example: `cc/claude-opus-4-7` tries `claude-opus-4-7` against `anthropic` + `opencode`. `openrouter/anthropic/claude-opus-4-7` also tries `claude-opus-4-7`.

**Alternatives considered:**
- **Maintain an explicit prefix-alias table** (`cc` → `claude`, etc.). Rejected — the prefix is decorative from our perspective; the *trailing* id is what registries index by. We don't need to know what provider the proxy *intends* to use, only what bare id to look up.
- **Require exact id match.** Rejected — misses the primary `cc/claude-opus-4-7` motivator.

**Rationale:** Simpler and future-proof. Any new proxy prefix scheme automatically works.

### Decision 5: Api-appropriate fallback defaults when the probe misses or is unavailable

**Choice:**

| api | contextWindow | maxTokens | reasoning | cost | input |
|---|---|---|---|---|---|
| `anthropic-messages` | 200_000 | 64_000 | false | zero | `["text","image"]` |
| `google-generative-ai` | 1_000_000 | 65_536 | false | zero | `["text","image"]` |
| `openai-completions` (default) | 128_000 | 16_384 | false | zero | `["text","image"]` |

Fallback applies whenever (a) no probe is passed, (b) the probe throws (tolerated via try/catch), or (c) the probe returns `null` / `undefined` for every candidate.

**Alternatives considered:**
- **Keep the current flat 200k fallback.** Rejected — wrong for Gemini (1M+ typical) and unreasonable for OpenAI's current floor (128k is the modern minimum; 200k implies Claude).
- **Refuse to register unknown models.** Rejected — breaks users who configure experimental / niche models.
- **Use `undefined` and let pi crash.** Rejected — `registerProvider` requires the field.

**Rationale:** The api type is the strongest hint for what "typical" metadata looks like. These floors are defensible guesses that are right more often than wrong for unknown-but-api-tagged models.

### Decision 6: `input` field defers to catalog when available, else `["text","image"]`

**Choice:** Catalog match returns whatever `input` the registry declares (usually `["text","image"]`; sometimes `["text"]` for legacy text-only entries). Fallback always returns `["text","image"]`.

**Rationale:** The existing `provider-auth-bridge` spec has the `### Requirement: Custom-provider models default to image-capable` requirement (added by `enable-image-input-custom-providers`). Our fallback path preserves that contract literally. The catalog-match path can surface `input: ["text"]` for a genuinely text-only model — which is *more* correct than forcing `["text","image"]` on a text-only model. Scenarios in that earlier spec that deal with "text-only upstream returns 400" continue to pass because the HTTP-rejection path isn't exercised by the client-side default.

### Decision 7: Re-snapshot pi's current model via `setModel` after re-registration

**Context:** Manual QA revealed that clicking a thinking level on a `proxy/cc/claude-opus-4-7` session silently snapped back to `"off"`. Root cause: pi's `supportsThinking()` reads `state.model.reasoning`, and `state.model` is a *snapshot* taken at `setModel()` time. If the user's model was selected before our `session_start` re-registration ran (e.g., a previous session where enrichment hadn't been applied yet), the snapshot carries the fallback `reasoning: false` even after our re-registration pass updates the registry to `reasoning: true`. pi's own `_refreshCurrentModelFromRegistry()` does get called inside `modelRegistry.registerProvider`, but it only runs if the `registerProvider` call is made via `this.runtime.registerProvider` — which is the path the extension uses. In principle that hook should refresh `state.model`; in practice the model-registry singleton's internal update timing means for custom providers we need to explicitly re-apply the model to guarantee the snapshot is current.

**Choice:** In the `session_start` handler, after the re-registration pass, detect whether `ctx.model.provider` is one of the names we just re-registered. If so, call `ctx.modelRegistry.find(ctx.model.provider, ctx.model.id)` to fetch the refreshed descriptor and invoke `await pi.setModel(refreshed)`. Wrap in try/catch so any error (missing auth, etc.) logs but doesn't abort the handler.

**Alternatives considered:**
- **Rely on pi's `_refreshCurrentModelFromRegistry()` hook alone.** Tested — didn't prove reliable for custom providers in the registry-capture-then-re-register sequence. Empirically the user's thinking cycler stayed broken until we added the explicit `setModel`.
- **Manually mutate `state.model` via a private pi API.** Rejected — would couple us to pi's internals and break on pi upgrades. `pi.setModel(model)` is the public API.
- **Only re-apply when `reasoning` changed.** Over-optimized; a `setModel` call for the already-selected model is cheap and idempotent. Always re-applying is simpler and covers the `contextWindow` / `cost` refresh too.

**Rationale:** `pi.setModel` is the documented public way to update the session's active model. It internally calls `_getThinkingLevelForModelSwitch()` and `setThinkingLevel()` to re-clamp against the new model's capabilities, so thinking level behavior is automatically corrected after the refresh. Idempotent: re-applying the same-ID model simply updates the stored descriptor.

### Decision 8: Mirror `session_updated` `thinkingLevel` / `model` into client `sessionStates`

**Context:** After clicking a thinking level, the SessionCard (sidebar) reflected the new value but the bottom StatusBar selector snapped back to `"off"`. Tracing revealed two different state buckets feeding the two UI surfaces:
- **SessionCard** reads `session.thinkingLevel` (the `DashboardSession` in `sessions` Map).
- **StatusBar** reads `selectedState.thinkingLevel ?? selectedSession.thinkingLevel` (prefers `sessionStates[id]`, populated by the event-reducer).

The server's `model_update` handler in `event-wiring.ts` patches the `DashboardSession` and broadcasts `session_updated` — but there's no dedicated browser-side `model_update` handler, and `session_updated` only updates `sessions[id]`. `sessionStates[id].thinkingLevel` stays stale.

**Choice:** In `useMessageHandler.ts`, after the existing `sessions` Map patch on `session_updated`, if the update includes `thinkingLevel` or `model`, also patch `sessionStates[sessionId]` (creating a fresh state via `createInitialState()` if the session had none). Only those two fields get mirrored; other `DashboardSession`-only fields (`name`, `cost`, `contextTokens`, `contextWindow`, …) remain unmirrored because no event-reducer-driven UI surface reads them.

**Alternatives considered:**
- **Broadcast a dedicated `model_update` message to browsers and add a client-side handler.** Requires protocol change and an extra message-type case. The `session_updated` mirror is a two-field patch in one existing handler — strictly smaller surface area.
- **Flip the StatusBar's precedence to prefer `session.thinkingLevel` over `state.thinkingLevel`.** Would change semantics for other parts of the app that rely on event-reducer-state-first ordering (e.g., during reconnect when `session` hasn't synced but events have). Risky.
- **Remove `sessionStates.thinkingLevel` entirely and make everything read from `sessions[]`.** Bigger refactor; would need to audit every `.thinkingLevel` reader.

**Rationale:** The `sessions` Map is the server's source of truth post-persist; the client's event-reducer state is an in-flight shadow. Mirroring the persisted value into the shadow is cheap, local, and makes the two UI surfaces observably consistent without changing semantics or protocols.

## Risks / Trade-offs

- **[Risk] Registry name collision with a proxy-private model** — a proxy could expose a model named `claude-opus-4-7` that is not Anthropic's Opus 4.7 (cheap rehosted clone, abliterated model, etc.). Our helper would stamp the catalog's metadata on it. **Mitigation:** Document in release notes that custom-provider model metadata is inferred by id match. Future work (not in this change): add `modelOverrides` in `providers.json` for explicit user control.
- **[Risk] pi's bundled catalog ships a stale or incorrect entry** — rare. **Mitigation:** pi-ai's `models.generated.js` is upstream-canonical and regenerated on release; our exposure is strictly ≤ theirs.
- **[Risk] Cost tracking suddenly starts producing non-zero numbers, confusing users who were used to `$0` on custom providers** — breaking expectation, though not breaking API. **Mitigation:** Note in release notes. No user action required; the numbers are more accurate.
- **[Risk] `reasoning: true` surfaces xhigh UI on models that don't support it** — if the registry claims reasoning but the proxy or actual upstream doesn't support it, the UI shows thinking-related controls that fail at send time. **Mitigation:** Strictly better than today's `reasoning: false` default, which *hides* thinking UI from real reasoning models (Opus 4.7, GPT-5) — current bug is worse than the potential regression.
- **[Risk] The extension's `activate()` registers providers before any `ctx.modelRegistry` is available, so the first pass uses fallback defaults.** **Mitigation:** The `session_start` handler captures `ctx.modelRegistry` and triggers a re-registration pass that overwrites the fallback entries with enriched metadata. `pi.registerProvider` is idempotent per pi's documented contract ("replaces all existing models for this provider"). After re-registration, if the session's currently-selected model is one of the re-registered providers, the handler also calls `pi.setModel(refreshed)` to re-snapshot `agent.state.model` with the enriched fields, which is required for `setThinkingLevel` to not clamp to `"off"` via `supportsThinking()`. Users see correct values from the first turn onward; the fallback is invisible because it gets overwritten before any prompt runs.
- **[Risk] The SessionCard and StatusBar could display different thinking levels** if the server-push-to-client state sync is incomplete. **Mitigation:** The client's `session_updated` handler mirrors `thinkingLevel` / `model` into both the `sessions` Map (feeding SessionCard) and the `sessionStates` Map (feeding StatusBar) to keep the two UI surfaces observably consistent.
- **[Trade-off] `CANDIDATE_PROVIDERS` is a fixed table in code** rather than config. Acceptable — the list is small, slow-moving, and changing it is a one-line patch.
- **[Trade-off] The helper is pure but needs a `probe` argument at every call site.** Acceptable — one call site in production, and tests get trivial DI.

## Migration Plan

No data migration. Behavior takes effect on the next session start or the next `credentials_updated` event after the bridge reload (`npm run reload`). Users observe:

1. Context-usage bar for `proxy/cc/claude-opus-4-7` (and similar) sessions recalculates against 1M instead of 200k — prior sessions' historical usage numbers are unchanged (they're already persisted).
2. Cost totals on new turns start reflecting catalog-matched prices. Historical turn_end events retain their original `cost: $0` — no retroactive recomputation.
3. Thinking / xhigh UI appears for reasoning-capable catalog-matched models it was previously hidden for.

Rollback: revert `packages/extension/src/provider-register.ts` and `npm run reload`. No persistent state to undo.

## Open Questions

None — the design is deliberately narrow.
