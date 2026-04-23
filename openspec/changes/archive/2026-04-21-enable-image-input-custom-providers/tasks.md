## 1. Tests (TDD)

- [x] 1.1 Add a new test file `packages/extension/src/__tests__/provider-register-input.test.ts` (or extend `provider-register-reload.test.ts`) that mocks `discoverModels` to return two models and asserts `registerProvider` was called with each model's `input` field deep-equal to `["text", "image"]`.
- [x] 1.2 Add a regression scenario in the same test: after `reloadProviders()` replays a changed provider entry, the re-registered models SHALL also carry `input: ["text", "image"]` (guards against future refactors that rebuild models differently in reload vs initial path).
- [x] 1.3 Run the test suite and verify the new test(s) fail against current code.

## 2. Implementation

- [x] 2.1 In `packages/extension/src/provider-register.ts`, in `registerEntry()`, change the model-mapping literal from `input: ["text"]` to `input: ["text", "image"]`. No other fields in the mapping change.
- [x] 2.2 If the same literal pattern appears in any sibling path (e.g. a `reloadProviders`-internal re-mapping), update it consistently. Search for `input: ["text"]` across `packages/extension/src/` to confirm `provider-register.ts` is the only site.
- [x] 2.3 Re-run the test(s) from §1 and confirm they pass.

## 3. Verification

- [x] 3.1 Run `npm test` at the repo root — all existing tests SHALL continue to pass (no capability-related assertions should break in other suites).
- [x] 3.2 Run `npm run reload:check` — type-check clean, all connected pi sessions reload.
- [x] 3.3 Manually verify against a running custom provider (e.g. the Judo Cluster 9Router proxy with a vision-capable model like `cc/claude-opus-4-7`):
  - Paste an image into a dashboard session targeting that model.
  - Confirm the model responds to the image content (not the `"(image omitted: …)"` placeholder).
- [x] 3.4 Manually verify the graceful-degradation path: target a modern text-only model (e.g. `glm/glm-5.1` or `minimax/MiniMax-M2.7`), paste an image, confirm the turn completes with either an empty-response or a polite "no image visible" message — not a client-side placeholder.

## 4. Documentation

- [x] 4.1 Update `AGENTS.md` under the `src/extension/provider-register.ts` file-table entry to note that discovered models default to `input: ["text", "image"]`, with a pointer to the change name for context.
- [x] 4.2 Add a one-line entry under `## [Unreleased]` in `CHANGELOG.md` describing the behavior change: *"Custom-provider models discovered via `providers.json` now advertise image input capability by default, so pasted images reach the upstream model."*
- [x] 4.3 Confirm `docs/architecture.md`'s provider-registration section does not contradict the new default (update if it claims `input: ["text"]` explicitly).
