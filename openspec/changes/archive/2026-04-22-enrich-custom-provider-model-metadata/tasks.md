## 1. Test Scaffolding (TDD: write failing tests first)

- [x] 1.1 Create `packages/extension/src/__tests__/enrich-model-metadata.test.ts` that imports `enrichModelMetadata` and `CatalogProbe` (to be exported from `../provider-register`). Tests SHALL build a fake probe from a plain `Map<string, CatalogEntry>` — NO `@mariozechner/pi-ai` import. Tests cover:
  - (a) `cc/claude-opus-4-7` + `anthropic-messages` + catalog map → 1M ctx / 128k maxTok / reasoning true / Opus cost object;
  - (b) bare `claude-sonnet-4-6` + `anthropic-messages` → 1M ctx;
  - (c) `anthropic/claude-opus-4-7` prefix → 1M ctx;
  - (d) `openrouter/openai/gpt-5` + `openai-completions` → gpt-5 metadata via last-segment fallback;
  - (e) unknown id + `anthropic-messages` → 200k / 64k / no reasoning / zero cost / `["text","image"]`;
  - (f) unknown id + `openai-completions` → 128k / 16k / zero cost / `["text","image"]`;
  - (g) unknown id + `google-generative-ai` → 1M / 65k / zero cost / `["text","image"]`;
  - (h) prefixed unknown (`minimax/custom-private-model` + `openai-completions`) → openai fallback;
  - (i) no `api` argument defaults to openai-completions fallback behavior;
  - (j) no `probe` argument returns api-appropriate fallback (not catalog);
  - (k) probe that throws on a candidate is tolerated — helper continues to next candidate and eventually falls back;
  - (l) candidate order — anthropic-messages tries `anthropic` before `opencode`;
  - (m) candidate order — google-generative-ai tries `google` before `google-vertex`;
  - (n) candidate order — openai-completions tries `openai` first;
  - (o) catalog entry with `input: ["text"]` is passed through (not upgraded to `["text","image"]`).
- [x] 1.2 Run `npm test -- enrich-model-metadata` and verify all new tests fail with "not a function" / "no export" (confirms the helper doesn't exist yet). **15/15 were initially red.**

## 2. Implement `enrichModelMetadata` Helper

- [x] 2.1 In `packages/extension/src/provider-register.ts`, add the exported types `ModelMetadata` and `CatalogProbe`. **Do NOT import `@mariozechner/pi-ai`.** The probe is a function parameter; production wiring (Task 3.1) supplies it from pi's `modelRegistry.find()`.
- [x] 2.2 Add the pure helper `export function enrichModelMetadata(discoveredId: string, api?: string, probe?: CatalogProbe | null): ModelMetadata`.
- [x] 2.3 Implement the candidate-provider table inside the helper as a module-level `const CANDIDATE_PROVIDERS: Record<string, readonly string[]>`:
  - `anthropic-messages` → `["anthropic", "opencode"]`
  - `google-generative-ai` → `["google", "google-vertex"]`
  - `openai-completions` → `["openai", "openrouter", "groq", "xai", "mistral"]` (also the default when api is unrecognized)
- [x] 2.4 Implement prefix stripping: build a deduplicated lookup list `[discoveredId, lastSegmentAfterSlash]`; iterate each id against each candidate provider by calling `probe(provider, id)`; return the first non-null match, passing through its `{ contextWindow, maxTokens, reasoning, cost, input }`.
- [x] 2.5 Implement the api-appropriate fallback table (`FALLBACK_DEFAULTS`) and return it — with a fresh `["text","image"]` `input` array — when no probe is supplied or no catalog match found. Probes that throw are caught and treated as no-match.
- [x] 2.6 Re-run `npm test -- enrich-model-metadata` and verify all tests pass. **15/15 green.**

## 3. Wire Helper into `registerEntry`

- [x] 3.1 Add a module-level `modelRegistryRef` to `provider-register.ts` plus a `getModelRegistry()` helper that returns the ref. Capture `ctx.modelRegistry` in the `session_start` handler (first-wins) and in `model_select` as a belt-and-suspenders backup.
- [x] 3.2 In `registerEntry()`, build a probe (`(provider, id) => registry.find(provider, id) ?? null` when registry is truthy and has `find`, otherwise `null`), and replace the hardcoded `{ contextWindow: 200000, maxTokens: 16384, cost: {...}, reasoning: false, input: ["text","image"] }` fields with a single `...enrichModelMetadata(m.id, entry.api, probe)` spread.
- [x] 3.3 Preserve `id: m.id` and `name: m.id` (unchanged behavior).
- [x] 3.4 In the `session_start` handler, after capturing `ctx.modelRegistry` for the first time, clear the `lastRegistered` snapshot and re-invoke `registerEntry()` for every provider in the current `providers.json`. `pi.registerProvider(name, config)` is idempotent per pi's `ModelRegistry.registerProvider` contract (“replaces all existing models for this provider”), so no `unregisterProvider` is needed — the second call overwrites the fallback-defaults registration from `activate()`.
- [x] 3.5 Extend `packages/extension/src/__tests__/provider-register-reload.test.ts` with two new tests:
  - **registry-reachable path** — capture the `session_start` handler registered via `pi.on`, call `activate(pi)` to get the initial fallback registration, then invoke the captured handler with a synthetic `ctx = { modelRegistry: fakeRegistry, ui: { notify: vi.fn() }, model: undefined }` where `fakeRegistry.find("anthropic", "claude-opus-4-7")` returns Opus 4.7 metadata; assert `pi.registerProvider` was called twice — first with fallback `contextWindow: 200_000`, then with the enriched `contextWindow: 1_000_000`, `reasoning: true`, and the Opus cost object.
  - **registry-missing fallback** — call `reloadProviders(pi)` without ever firing `session_start`, so `modelRegistryRef` stays null and the probe is `null`; assert `pi.registerProvider` receives a model descriptor with the `anthropic-messages` fallback (`contextWindow: 200_000`, `maxTokens: 64_000`, `input: ["text","image"]`).
- [x] 3.6 Run the full extension test suite (`npm test -- packages/extension/src`) and verify no existing tests break — in particular the image-capable-default tests in the `provider-auth-bridge` suite. **380/380 extension tests pass.**

## 4. Verify Against Live Provider (Manual Smoke Test)

> **Performed by the user.** The automated tests cover the pure helper and the `registerEntry` call path; this section verifies end-to-end behavior against a real proxy.

### 4.1 Build + push bridge to running sessions

- [x] 4.1.1 From the repo root: `npm run reload:check` (type-checks the workspace then rebuilds + pushes the bridge to all connected pi sessions).
  - Expected: TypeScript exits 0, all sessions log `[dashboard-bridge] ready` within a few seconds.
  - If tsc fails with an `unregisterProvider` error, the pi-env.d.ts fix from the hot-reload change may have been dropped — run `grep unregisterProvider packages/extension/src/pi-env.d.ts`; if missing, add `unregisterProvider(name: string): void;` to the `ExtensionAPI` interface.

### 4.2 Confirm proxy provider is discoverable

- [x] 4.2.1 In any pi session configured with the user's `proxy` entry (`https://llmproxy.cluster1.judo.technology/v1`, api `anthropic-messages`, at least one `cc/*` model advertised by its `/v1/models`), open the model picker with `/model`.
  - Expected: `proxy/cc/claude-opus-4-7` appears in the list.
  - If not: check `~/.pi/dashboard/server.log` for `registerProvider("proxy")` errors; check `providers.json` is well-formed JSON.

### 4.3 Verify 1M context-window enrichment

- [x] 4.3.1 Switch the session to `proxy/cc/claude-opus-4-7` (via `/model` or the dashboard model picker).
- [x] 4.3.2 In the dashboard UI, locate the session's **context-usage bar** (bottom-right of the chat pane, or in the session header on mobile).
  - Expected: the bar's denominator is **1,000,000** (not 200,000). A fresh session reads `0 / 1,000,000 tokens` or similar.
  - If it still reads `/ 200000`: `modelRegistryRef` may never have been captured. Trigger a fresh `session_start` (e.g., via `/compact`, `/reload`, or starting a new session — the re-registration pass only runs once per extension activation). Verify pi's `ExtensionContext.modelRegistry` is populated (`grep "modelRegistry: ModelRegistry" node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`).

### 4.4 Verify non-zero cost tracking

- [x] 4.4.1 Send a short prompt (e.g., "Say hi") to `proxy/cc/claude-opus-4-7`.
- [x] 4.4.2 Wait for the turn to complete.
- [x] 4.4.3 Inspect the turn's cost either in the dashboard's token-usage popover or by tailing `~/.pi/agent/sessions/<session>.jsonl` and finding the `turn_end` event.
  - Expected: `usage.cost.inputCost` and `usage.cost.outputCost` are **non-zero** and reflect Anthropic's Opus 4.7 pricing (approximately `inputTokens × $5/1M` and `outputTokens × $25/1M`).
  - If `cost: { input: 0, output: 0 }`: the registry probe returned `null` — see 4.3 diagnostics.

### 4.5 Verify reasoning-model UI is available (optional — implied by 4.3–4.4)

- [x] 4.5.1 On the same Opus 4.7 session, open the thinking-level cycle (keyboard shortcut or click the thinking indicator in the session header).
  - Expected: `low` / `medium` / `high` / `xhigh` selector appears (reasoning `true` was registered).
  - If no thinking UI appears: `reasoning: false` was registered — registry probe missed.

### 4.6 Verify catalog-known bare id still works (optional)

- [x] 4.6.1 Switch the session to `proxy/claude-haiku-4-5-20251001` (or any other known Anthropic model advertised by the proxy).
  - Expected: context-usage bar reads `/ 200,000` (Haiku's native window) — verifies we're not clobbering correct cases. Cost tracking reflects Haiku's pricing, not Opus's.

### 4.7 Verify a fallback model still registers (optional sanity check)

- [x] 4.7.1 If the proxy advertises any model id that is definitely not in pi's catalog (e.g., a private or fine-tuned id), select it.
  - Expected: the model is selectable; context bar reads `/ 200,000` (anthropic-messages fallback) and cost reads `$0`. No error in the session log.

### 4.8 Verify thinking level selector is in sync across UI surfaces

- [x] 4.8.1 On a `proxy/cc/claude-opus-4-7` session after a fresh `session_start` (post-reload), click a thinking level in the **bottom StatusBar** selector (e.g., "medium").
  - Expected: both the **SessionCard** (sidebar) AND the **bottom StatusBar** update to show `medium` within ~100 ms. The level persists if you refresh the browser.
  - If only the SessionCard updates and the StatusBar snaps back to `off`: task 3c was not applied — client bundle is stale. Hard-refresh the browser (Ctrl+Shift+R) to bust the service worker.
  - If both UI surfaces stay at `off`: task 3b was not applied — pi is clamping `"high"` to `"off"` because `state.model.reasoning === false`. Trigger a fresh `session_start` (via `/compact` or new session).

## 5. Documentation

- [x] 5.1 Updated `AGENTS.md`'s key-files entry for `src/extension/provider-register.ts` to describe `enrichModelMetadata(id, api, probe)` with `probe` wrapping pi's `modelRegistry.find()` (captured from `ctx.modelRegistry` at the first `session_start` event; `model_select` is a fallback capture point). References change `enrich-custom-provider-model-metadata` (stacked with `enable-image-input-custom-providers`).
- [x] 5.2 Added CHANGELOG.md entry under `## [Unreleased]` → "Fixed" describing the fix with 1M Opus example, the modelRegistry mechanism, proxy-prefix stripping, and api-appropriate fallback table.
- [x] 5.3 Added a new subsection `### Model metadata enrichment for custom providers` to `docs/architecture.md` between the provider-auth flow and the Test-button subsection, describing the `enrichModelMetadata` helper, candidate-provider ordering, and fallback behavior. Pointer to `packages/extension/src/provider-register.ts` and the change id.

## 6. Archive Readiness

- [x] 6.1 Ran `openspec validate enrich-custom-provider-model-metadata` — **valid**.
- [x] 6.2 Ran the full test suite `npm test` — **2,645 passed / 9 skipped / 0 failed** (249 test files).
- [x] 6.3 Manual smoke test (Section 4.1–4.4) confirmed against live `proxy/cc/claude-opus-4-7` — context bar shows 1,000,000; cost tracks non-zero Opus pricing.
- [x] 6.4 Hand off to the archive skill (`/opsx:archive`).
