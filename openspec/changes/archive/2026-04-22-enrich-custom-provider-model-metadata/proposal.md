## Why

When a custom provider (e.g., a user-run LLM proxy like 9router or llmproxy) is registered via `~/.pi/agent/providers.json`, the bridge extension's `registerEntry()` synthesises every discovered model with hardcoded `contextWindow: 200000`, `maxTokens: 16384`, `cost: 0`, and `reasoning: false`. This is silently wrong for the common case of proxying real frontier models: `cc/claude-opus-4-7` routes through 9router to Anthropic's 1M-context Opus 4.7 but is advertised to pi as 200k, causing premature compaction, inaccurate context-usage bars, and zero cost tracking. The same gap affects Sonnet 4.6 (1M), GPT-5 families, Gemini 2.5 Pro (2M), and any reasoning model whose `reasoning: true` capability is lost on the way in.

## What Changes

- Add a pure helper `enrichModelMetadata(discoveredId, api?, probe?)` in `packages/extension/src/provider-register.ts` that returns `{ contextWindow, maxTokens, reasoning, cost, input }` for a discovered model id.
- The helper takes an injected `CatalogProbe` function `(provider, id) => CatalogEntry | null`. Production wires it to pi's documented `modelRegistry.find(provider, id)` API. The registry reference is captured from `ctx.modelRegistry` the first time pi fires `session_start` on the extension (with `model_select` as a backup capture point). Tests pass a fake probe built from a `Map`.
- The helper strips common proxy prefixes (`cc/`, `anthropic/`, `openrouter/anthropic/…`) before lookup — it tries the full id first, then the segment after the last `/`.
- The helper iterates an api-appropriate candidate-provider list in fixed order: `anthropic-messages` → `["anthropic", "opencode"]`; `google-generative-ai` → `["google", "google-vertex"]`; `openai-completions` (default) → `["openai", "openrouter", "groq", "xai", "mistral"]`. First catalog match wins.
- When no probe is supplied or no catalog entry matches, fall back to api-appropriate defaults: `anthropic-messages` → 200k/64k, `google-generative-ai` → 1M/65k, `openai-completions` → 128k/16k. Fallbacks keep `input: ["text","image"]` preserving the existing image-capable-by-default behavior for custom providers.
- Wire `enrichModelMetadata` into `registerEntry()` at the model-mapping step and delete the four hardcoded fields.
- After the `session_start` re-registration pass, re-invoke `pi.setModel(refreshed)` for the currently-selected custom-provider model so pi's `agent.state.model` snapshot picks up the enriched `reasoning` / `contextWindow` / `cost`. Without this, pi keeps the fallback descriptor snapshotted at `activate()` time and `setThinkingLevel` silently clamps to `"off"` via `supportsThinking()`.
- Client-side: mirror `thinkingLevel` / `model` fields from `session_updated` messages into `sessionStates[sessionId]` (not just the `sessions` Map), so the bottom StatusBar selector (which reads event-reducer state preferentially) stays in sync with the session card after `model_update` round-trips.
- **No pi-ai import anywhere.** The helper uses pi's public `modelRegistry.find()` API, which itself already merges pi-ai's bundled catalog with any dynamically-registered models. Zero new dependencies; zero install footprint changes.
- **No `providers.json` schema change, no new UI, no protocol change.** Zero impact on OAuth/built-in providers (they never touch `registerEntry`).

## Capabilities

### New Capabilities

- `provider-auth-bridge`: adds requirements that the bridge extension (a) resolves `contextWindow`, `maxTokens`, `reasoning`, `cost`, and `input` for every custom-provider model by consulting pi's `modelRegistry` via an injected probe, with api-appropriate fallbacks when the probe is missing or returns no match, and (b) re-snapshots pi's currently-selected model via `pi.setModel(refreshed)` after the `session_start` re-registration pass so thinking-level capability checks see the enriched descriptor.
- `model-selector`: adds the requirement that the client mirrors `thinkingLevel` / `model` updates from `session_updated` messages into `sessionStates[sessionId]`, keeping the StatusBar selector and SessionCard label consistent.

### Modified Capabilities

None. The existing `### Requirement: Custom-provider models default to image-capable` (added by `enable-image-input-custom-providers`) is preserved as-is — the fallback path of this change continues to emit `input: ["text","image"]`. The catalog-match path can surface `input: ["text"]` for text-only catalog entries, but only when the probe is reachable and finds an authoritative match, which is strictly more-correct than the prior blanket default.

## Impact

- **Code**: `packages/extension/src/provider-register.ts` (one helper added, one call site updated, one `CatalogProbe` type exported, `session_start` handler adds registry capture + re-registration + `pi.setModel` refresh). `packages/client/src/hooks/useMessageHandler.ts` (`session_updated` handler adds `sessionStates` mirror for `thinkingLevel` / `model`). Two test files for the extension: new `packages/extension/src/__tests__/enrich-model-metadata.test.ts` (15 tests covering the pure helper); extended `packages/extension/src/__tests__/provider-register-reload.test.ts` (two new tests covering `registerEntry` behavior with and without an injected registry).
- **Runtime deps**: none. `ctx.modelRegistry` is part of pi's documented `ExtensionContext` (see `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts` — `ExtensionContext.modelRegistry: ModelRegistry`) passed to every event handler.
- **Type surface**: exports new `ModelMetadata` and `CatalogProbe` types from `provider-register.ts` for testability. `registerEntry`'s return value and behavior are unchanged. Adds a module-level `modelRegistryRef` captured at `session_start`; triggers one idempotent re-registration pass at capture time (relies on `pi.registerProvider`'s documented "replaces all existing models for this provider" contract).
- **Behavior visible to users**:
  - Context-usage bar and compaction thresholds on custom-provider sessions become accurate for any model pi's catalog knows about (which includes pi-ai's bundled catalog and any other dynamically-registered models).
  - Cost tracking starts producing non-zero numbers for catalog-matched models (was always `$0` before).
  - `reasoning: true` models (Opus 4.x, Sonnet 4.x, GPT-5, o1/o3/o4) get their `<thinking>` UI and xhigh level support in custom-provider sessions.
- **Risk**: a proxy that exposes a name-collision (e.g., a model called `claude-opus-4-7` that is not actually Anthropic Opus 4.7) would inherit the catalog's metadata. Acceptable — today's behavior (200k flat + $0) is strictly worse for every real-world case; users needing overrides can request a per-model override in a follow-up change.
- **No database/config migration**: provider metadata is recomputed at every session start and every `credentials_updated` event; the fix takes effect on the next reload with no state conversion.
