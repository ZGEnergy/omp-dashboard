## Why

Custom-provider models registered through `~/.pi/agent/providers.json` (9Router proxies, LiteLLM, LocalAI, etc.) are hardcoded with `input: ["text"]` in `provider-register.ts`. When a user pastes an image into the dashboard and targets a custom-provider model, pi-ai's `downgradeUnsupportedImages` strips every image and replaces it with the placeholder string `"(image omitted: model does not support images)"` before the request ever leaves the process. The model never sees the image — even on models that fully support vision (Claude Opus 4.x, GPT-4o, Gemini 2.5, every OpenRouter vision model on 9Router).

Manually verified against 9Router: vision-capable models on the proxy handle images correctly; modern text-only models (GLM-5, MiniMax-M2) cleanly return a 200 saying *"there is no image in this message"*, which is an acceptable, honest UX the user learns from. Only legacy 2023-era models (gpt-3.5-turbo, vanilla gpt-4) return a hard 400 — a vanishingly rare case in practice.

## What Changes

- Change the default capability for every model discovered via `discoverModels()` from `input: ["text"]` to `input: ["text", "image"]`.
- No UI changes, no heuristics, no per-model configuration.
- Behavior for built-in/OAuth providers (Anthropic, Codex, GitHub Copilot, Gemini CLI, Antigravity) is **unchanged** — those continue to use pi-ai's `models.generated.js` capability data.
- Only custom providers registered via `providers.json` are affected.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `provider-auth-bridge`: The custom-provider registration path SHALL declare `input: ["text", "image"]` as the default capability for every discovered model, so image-bearing prompts are forwarded to the upstream endpoint instead of being stripped client-side.

## Impact

- **Affected code**: `packages/extension/src/provider-register.ts` (one-line change in `registerEntry()`).
- **Affected tests**: `packages/extension/src/__tests__/provider-register.test.ts` — update any assertion that expects `input: ["text"]` and add coverage for the new default.
- **User-visible behavior**:
  - Vision-capable models (Claude, GPT-4o, Gemini, OpenRouter multimodals) now receive pasted images correctly.
  - Text-only modern models return a polite "I don't see an image" response — no silent stripping, no misleading placeholder.
  - Legacy text-only models (gpt-3.5-turbo, vanilla gpt-4) will surface the upstream 400 error instead of silently sending placeholder text — acceptable since these models are rarely used.
- **No protocol changes, no schema changes, no breaking changes for existing `providers.json` files.**
