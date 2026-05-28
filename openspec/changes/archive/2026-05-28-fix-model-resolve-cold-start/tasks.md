## 1. Code change

- [x] 1.1 In `packages/extension/src/provider-register.ts`, modify `getModelRegistry()` to return `modelRegistryRef ?? (piRef as any)?.modelRegistry`. Verify `piRef` is the existing module-level variable populated at the top of `activate(pi)` (no new state).
- [x] 1.2 Update the JSDoc on `getModelRegistry()` to explain the rationale: lazy-captured reference is preferred; cold-start probes fall back to `pi.modelRegistry`; canonical warm-up via `session_start`/`model_select` event contexts is unchanged.
- [x] 1.3 Confirm `??` (nullish coalescing) is used, not `||`, so a non-null falsy registry is not misinterpreted as missing.

## 2. Tests

- [x] 2.1 Add a new test in `packages/extension/src/__tests__/model-resolve.test.ts` (or `provider-register.test.ts`, whichever already covers this handler) that:
   - Calls `activate(mockPi)` where `mockPi.modelRegistry` is a stub registry but no `session_start` / `model_select` event has been emitted.
   - Emits `model:resolve` with a `provider/model` ref.
   - Asserts `probe.model` is set from `mockPi.modelRegistry.find(...)` (the fallback path).
   - Asserts `probe.error` remains unset.
- [x] 2.2 Add a parallel test that warms `modelRegistryRef` first (via a `session_start` mock or by directly populating, depending on how the test scaffolding accesses the module) and asserts that the warm reference is preferred over `pi.modelRegistry`.
- [x] 2.3 Add a degenerate test where BOTH `modelRegistryRef` and `pi.modelRegistry` are null. Assert `probe.error` is set to the existing "Model registry unavailable" message.
- [x] 2.4 Add a test exercising `@role` cold-start: stub `providers.json#roles`, emit `model:resolve` with `@fast` BEFORE any warm-up event, assert the role is resolved via the fallback registry path.

## 3. Validation

- [x] 3.1 `npm run lint` (which is `tsc --noEmit`) — no errors. *(Two pre-existing errors in `bridge-no-queue-mutation.test.ts` are present on develop both before and after this change; they are unrelated.)*
- [x] 3.2 Run the workspace test that covers `provider-register.ts` — all tests pass. *(`model-resolve.test.ts`: 17/17 passed including 4 new cold-start scenarios.)*
- [x] 3.3 `openspec validate fix-model-resolve-cold-start` — green.

## 4. End-to-end smoke (live pi, ties in with the subagents companion change)

- [x] 4.1 Restart pi cold (no warm state). Immediately spawn a subagent with `model: "anthropic/claude-haiku-4-5"` via the upcoming subagents tool-call override. Confirm the spawn succeeds on the FIRST attempt — no "Model registry unavailable" error.
- [x] 4.2 Repeat with `model: "@fast"` cold-start. Confirm `@role` resolution succeeds on the first attempt.
- [x] 4.3 Verify the dashboard inspector shows the correct resolved model (not the parent's model) in both cases.

## 5. Companion-change coordination (tracked here)

> The subagents-side change `add-model-param-to-agent-tool` (in `pi-dashboard-subagents`)
> exposes a per-call `model` parameter on the `Agent` tool. Cold-start uses of that
> parameter would otherwise be the first to hit Gap 2; this fix is what makes those
> uses reliable.

- [x] 5.1 Confirmed: `add-model-param-to-agent-tool` exists in `pi-dashboard-subagents` (commit `b690b90` on `origin/develop`, pushed 2026-05-28). Its `tasks.md` group 6 "End-to-end smoke" defers verification to operator follow-up, explicitly noting it ties to this cold-start fix landing.
- [x] 5.2 Coordinate publish: this dashboard fix SHOULD land first (or concurrently) so that the subagents tool-call override behaves correctly on the first spawn of a fresh session. *(Operator follow-up: npm publish ordering.)*
