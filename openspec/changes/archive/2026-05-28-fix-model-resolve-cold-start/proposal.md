## Why

The dashboard's `model:resolve` event handler (in `packages/extension/src/provider-register.ts`) reads the model registry through `getModelRegistry()`, which returns a lazily-captured reference `modelRegistryRef`. That reference is populated only when a `session_start` or `model_select` event handler fires (lines 740–757). If a `model:resolve` probe arrives BEFORE either of those events has populated `modelRegistryRef`, the handler short-circuits with `probe.error = "Model registry unavailable — cannot resolve \"<ref>\"."` and the resolution fails.

This was observed live on 2026-05-28: a subagent spawned moments after pi started got that exact error for `model: "anthropic/claude-haiku-4-5"`. A subsequent spawn — once normal session events had fired — worked. The bug is purely a cold-start timing issue.

The fix is one-liner-shaped: pi exposes the model registry directly on the `pi` handle as `pi.modelRegistry`. The subagents extension's in-process fallback already uses this. Reading it from the dashboard handler too eliminates the timing dependency entirely.

## What Changes

- **MODIFIED** `getModelRegistry()` in `packages/extension/src/provider-register.ts` returns `modelRegistryRef ?? (piRef as any)?.modelRegistry` instead of just `modelRegistryRef`. When the lazily-captured reference is null (cold-start), the function falls through to the registry that pi exposes directly on the extension API handle. The `piRef` module-level variable already exists (`piRef = pi` is set at the top of `activate(pi)`), so no new wiring is needed.
- **NO** changes to the listener body (`resolveModelProbe`), the probe shape, the role lookup, the auth side-effect, or any error messages.
- **NO** changes to the legacy `flow:resolve-model` handler — it stays exactly as today.

That's the entire code change. ~3 lines in one file.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dashboard-model-resolution`: one scenario added documenting the cold-start fallback. The existing requirements are unchanged; the scenario makes the behaviour explicit and testable.

## Impact

- **Code:** ~3 lines in `packages/extension/src/provider-register.ts` (change `getModelRegistry()` body).
- **Tests:** ONE new unit test exercising the fallback path with `modelRegistryRef === null` and a stub `pi.modelRegistry`. Mirrored against the existing `__tests__/model-resolve.test.ts` pattern.
- **Docs:** Inline JSDoc on `getModelRegistry()` is updated to explain the fallback rationale. No README/CHANGELOG entry necessary — it's an internal correctness fix.
- **No new dependencies. No new files. No new exports.**
- **Cross-repo effect:** every emitter of `model:resolve` — pi-dashboard-subagents (spawn), pi-flows (flow execution), any future caller — benefits immediately. The fix lands once here and unblocks all callers.

## Why this is its own change (not part of subagents' change)

- It's in a different repo (`pi-agent-dashboard`).
- It's an independent bug-fix that does not require the subagents schema change to land.
- It can be reverted independently if the fix turns out to interact with another timing assumption.
