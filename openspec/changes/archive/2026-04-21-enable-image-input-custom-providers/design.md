## Context

`packages/extension/src/provider-register.ts:registerEntry()` is the single place where custom-provider models (discovered via the upstream `/v1/models` endpoint) get registered with pi via `pi.registerProvider()`. Each discovered model is mapped to a minimal capability descriptor:

```ts
// current code — packages/extension/src/provider-register.ts:183-191
const models = discovered.map((m) => ({
  id: m.id,
  name: m.id,
  reasoning: false,
  input: ["text"] as ("text" | "image")[],
  contextWindow: 200000,
  maxTokens: 16384,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
}));
```

Downstream, pi-ai's `providers/transform-messages.js:downgradeUnsupportedImages` inspects `model.input.includes("image")`. If false (current default), every image block in the message history is replaced with the text `"(image omitted: model does not support images)"` *before* the outbound HTTP request is serialized. This happens for **every** custom-provider model regardless of whether it actually supports vision.

The OpenAI-compatible `/v1/models` endpoint (OpenAI spec, 9Router implementation, LiteLLM, LocalAI) does **not** include modality metadata in its response schema. We verified 9Router v0.3.96 specifically: only the 7 standard fields (`id, object, created, owned_by, permission, root, parent`) are returned. No `modalities`, no `input`, no `vision` flag. So we have no authoritative upstream source for per-model capabilities.

### Empirical behavior when sending images to text-only custom-provider models (tested against 9Router)

| Model | Outcome |
|---|---|
| `gh/gpt-3.5-turbo` | HTTP 400: *"The requested model is not supported"* — hard reject |
| `gh/gpt-4` (vanilla) | HTTP 400: *"Invalid image data"* — hard reject |
| `minimax/MiniMax-M2.7` | HTTP 200: model replies *"there is no image attached to this message"* |
| `glm/glm-5.1` | HTTP 200: empty / brief response |
| `cc/claude-opus-4-7`, `gh/gpt-4o`, `gemini/gemini-2.5-pro`, all OpenRouter `*-vl`, etc. | HTTP 200: correctly processes the image |

Modern 2024+ text-only models cope cleanly. Only pre-2024 legacy OpenAI models hard-reject. The bulk of the model catalog is either vision-capable or gracefully-degrading.

## Goals / Non-Goals

**Goals:**
- Users who paste an image and target a vision-capable custom-provider model MUST have the image reach the model.
- Zero net-new configuration surface: no per-model UI, no heuristic allowlist to maintain, no provider-level toggle.
- Built-in / OAuth providers are untouched — their capabilities still come from pi-ai's `models.generated.js`.
- Change is a one-line diff in `provider-register.ts` plus updated tests.

**Non-Goals:**
- We will NOT add automatic 400-on-image retry logic — that requires changes in upstream pi-ai and doesn't help the "HTTP 200 silently ignores" case anyway.
- We will NOT maintain a regex/pattern-based heuristic for which model ids support vision. Model id conventions drift constantly; a curated list is a maintenance burden with marginal benefit.
- We will NOT add a per-model vision checkbox to the Settings UI. The value per edge-case (pre-2024 legacy OpenAI) is too small to justify the UI complexity.
- We will NOT expose modality info from `/v1/models` — that would require an upstream change in every OpenAI-compatible proxy and is out of our control.
- We will NOT change `reasoning`, `contextWindow`, `maxTokens`, or `cost` defaults — only `input`.

## Decisions

### Decision 1: Optimistic default over heuristic, probe, or upstream-metadata lookup

**Chosen:** Always declare `input: ["text", "image"]` for every discovered custom-provider model.

**Alternatives considered:**

1. **Regex heuristic by model id** (`/claude-(opus|sonnet|haiku)-[4-9]|gpt-4o|gemini-[2-9]/` etc.).
   - Rejected. Model id conventions are unstable. `cc/claude-opus-4-7`, `gh/claude-opus-4.1`, `ag/claude-opus-4-6-thinking`, `gh/oswe-vscode-prime` — each family uses different separators and versioning. False negatives mean silently dropped images on valid vision models. False positives are identical to the optimistic default. All risk, little benefit.

2. **Vision-capability probe on discover** (send a 1×1 pixel image on registration, check for 400).
   - Rejected. N×HTTP latency on every session start, burns quota, and the "HTTP 200 silently ignores" case (40% of text-only modern models per our tests) makes probe results unreliable anyway.

3. **Enrich `/v1/models` response on 9Router to include modalities.**
   - Out of scope. 9Router's internal `PROVIDER_MODELS` catalog doesn't even store the data. Would require changes in every OpenAI-compatible proxy we don't control.

4. **Per-provider `allowImages: false` override in `providers.json`.**
   - Deferred. Can be added later as a narrow opt-out if a specific user reports pain from legacy-model 400s. Not needed for v1.

**Rationale:** The user's explicit preference is *"I don't care if the model says 'I don't see an image' — user will learn not to send images to that model."* This is a valid UX stance for a power-user tool where custom providers are configured deliberately. The optimistic default makes vision-capable models (the vast majority of the modern catalog) work instantly with no configuration. The failure modes for text-only models are either honest ("no image here") or a clear upstream error — both arguably more useful than today's silent client-side stripping.

### Decision 2: Do not gate on provider `api` type

The `ProviderEntry.api` field can be `"openai-completions"`, `"anthropic-messages"`, or `"google-generative-ai"`. All three pi-ai serializers already branch on `model.input.includes("image")` to emit the correct per-format image payload (OpenAI `image_url`, Anthropic `image`, Gemini `inline_data`). We rely on those existing serializers being correct. No additional logic needed here.

### Decision 3: Scope limited to `registerEntry` — no other call sites

`registerEntry()` is the only place where custom-provider models are synthesized. Built-in providers pass through pi-ai's `models.generated.js`, which already carries correct per-model `input` arrays. Those continue unchanged.

## Risks / Trade-offs

- **[Risk] Legacy text-only models (gpt-3.5-turbo, vanilla gpt-4) now surface an upstream 400 instead of a silent "image omitted" placeholder.**
  → Mitigation: The failure is transparent and the error message from the upstream is forwarded to the user. If users actually hit this in practice, we add a provider-level `allowImages: false` opt-out field in a follow-up change. No users currently reported pain from this — it's a theoretical edge case.

- **[Risk] Replay semantics: if a user pastes an image into a session targeting a text-only model that hard-rejects, the image stays in the message history and every subsequent turn will 400 again.**
  → Mitigation: Users can start a new session, use `/compact`, or switch models. Today's behavior (silent client-side stripping) doesn't have this problem but trades it for the much worse "vision model never gets the image" bug we're fixing. The frequency ratio makes the trade correct.

- **[Risk] Some text-only models may bill for uploaded image bytes even when discarding them silently.**
  → Mitigation: Pennies per image. Users targeting text-only models shouldn't be pasting images anyway. Users will learn quickly from the model's own response.

- **[Trade-off] No way to declare "this provider is text-only" to suppress image send.**
  → Accepted. Adding configuration surface for this is disproportionate to the problem size. Revisit if user demand emerges.

## Migration Plan

Zero migration. Existing `providers.json` files are unchanged. On the next bridge reload or session start, discovered models pick up the new default. No cache invalidation, no data migration, no user action required.

**Rollback:** Revert the one-line change. Providers immediately return to `input: ["text"]` behavior. No data damage possible.

## Open Questions

None. The change is scoped, empirically validated, and the user has explicitly accepted the trade-offs.
