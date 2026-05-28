## Context

`packages/extension/src/provider-register.ts`:

```ts
let piRef: any = null;
let modelRegistryRef: any = null;

export function activate(pi: ExtensionAPI) {
  piRef = pi;
  // …
}

function getModelRegistry(): any {
  return modelRegistryRef;
}
```

`modelRegistryRef` is populated only inside two `pi.on(…)` handlers:

```ts
pi.on("model_select", async (_event, ctx) => {
  if (!modelRegistryRef && ctx.modelRegistry) modelRegistryRef = ctx.modelRegistry;
  // …
});

pi.on("session_start", … ctx => {
  if (!modelRegistryRef && ctx.modelRegistry) modelRegistryRef = ctx.modelRegistry;
  // …
});
```

If a `model:resolve` event arrives BEFORE either of those handlers has fired (typically: very first subagent spawn in a freshly-started pi process), `modelRegistryRef` is still `null` and `resolveModelProbe` short-circuits with:

```ts
const registry = getModelRegistry();
if (!registry) {
  probe.error = `Model registry unavailable — cannot resolve "${ref}".`;
  return;
}
```

Meanwhile, pi exposes the model registry **directly** as `pi.modelRegistry`. The subagents extension's in-process fallback (`extensions/agent.ts::getModelRegistry`) already reads it from there. The dashboard handler has the `pi` handle in module scope as `piRef` but doesn't use it for this purpose.

## Goals / Non-Goals

**Goals:**

- The dashboard's `model:resolve` handler succeeds at cold-start when invoked before any session/model_select event has populated `modelRegistryRef`.
- Behaviour after warm-up is unchanged (warm `modelRegistryRef` continues to be preferred).
- No new events, no new bootstrapping in `activate()`, no race conditions.

**Non-Goals:**

- Refactoring the lazy-capture pattern. We keep `modelRegistryRef` because it carries hot-path provenance from event contexts (the warmed reference is what every other code path in `provider-register.ts` consumes; we don't want to make `pi.modelRegistry` the canonical source — it might lag or differ in subtle ways under future SDK changes).
- Eliminating the dependency on `session_start` / `model_select` events for OTHER consumers of `getModelRegistry()`. Those paths run after warm-up by design.
- Removing the `probe.error = "Model registry unavailable…"` fallback inside `resolveModelProbe`. It's still the right behaviour if BOTH references are null (degenerate case: pi was misconstructed).

## Decisions

### Decision 1: Use `??` not `||` for the fallback

```ts
function getModelRegistry(): any {
  return modelRegistryRef ?? (piRef as any)?.modelRegistry;
}
```

Nullish coalescing avoids interpreting a registry that's a non-null falsy value (e.g. zero, empty string — unlikely, but the type is `any`) as missing. `??` is the type-correct choice here.

### Decision 2: Read `pi.modelRegistry` lazily via `piRef`, not as a fresh capture in `activate()`

We do NOT add `modelRegistryRef = (pi as any).modelRegistry;` to the top of `activate(pi)`. Reasons:

- `pi.modelRegistry` may be the *uncwd-bound* registry while `ctx.modelRegistry` from event handlers is the session-bound registry. The lazy-capture preference exists because future SDK versions may differ. We don't want to change which reference wins once warmed.
- Reading `piRef.modelRegistry` on each call is cheap (property access). No performance concern.

### Decision 3: Use the existing `piRef` — don't add a new module variable

`piRef` already exists and is set to `pi` at the start of `activate(pi)`. Reusing it keeps the change to one place. No new state.

### Decision 4: Do NOT mutate `modelRegistryRef` when reading `piRef.modelRegistry`

We could write:

```ts
function getModelRegistry(): any {
  if (!modelRegistryRef && piRef?.modelRegistry) modelRegistryRef = piRef.modelRegistry;
  return modelRegistryRef;
}
```

Rejected. We don't want a cold-start probe to permanently capture `pi.modelRegistry` and shadow a later `ctx.modelRegistry`. The fallback is a per-call rescue; warm-up via `session_start` / `model_select` remains the canonical capture path.

### Decision 5: No legacy-handler change

The deprecated `flow:resolve-model` listener uses the same `getModelRegistry()` helper, so it benefits from the same fix transparently. We do NOT add a separate `pi.modelRegistry` fallback inside it; one fix in the helper covers both listeners.

### Decision 6: One spec scenario, one test

The change is small and the failure mode is narrow. We add ONE new scenario to `dashboard-model-resolution` (the cold-start fallback) and ONE new test in `provider-register`'s test file. Multiple scenarios would dilute the focus.

## Risks / Trade-offs

- **[Risk]** `pi.modelRegistry` differs from `ctx.modelRegistry` in subtle ways under a future pi SDK version. → Mitigated by the `??` precedence: once a handler has captured `ctx.modelRegistry`, the cold-start fallback is no longer used. We accept that the FIRST cold-start probe might use the slightly-different reference; subsequent probes warm up the canonical one.
- **[Risk]** `piRef` is null because `activate(pi)` hasn't run yet. → Not a risk in practice: `pi.events.on("model:resolve", …)` is registered INSIDE `activate(pi)`, so by the time any probe can fire, `piRef` is set. The `?.` chain handles the edge case defensively.
- **[Trade-off]** Tests must stub `piRef` not just `modelRegistryRef`. → Minor; the existing test scaffolding already constructs a mock `pi` object that's passed to `activate(pi)`. Adding a `pi.modelRegistry` field to the mock is a one-line change.
- **[Risk]** The change becomes too small to be worth a spec scenario. → Disagree. The scenario documents an invariant ("cold-start `model:resolve` succeeds when the registry is reachable via `pi.modelRegistry` even if no event context has been received") that prevents regression and clarifies an otherwise-confusing failure mode.

## Migration Plan

No user-facing migration. Pure correctness fix. After landing:

- Operators see cold-start subagent spawns and flow executions resolve successfully instead of erroring with "Model registry unavailable".
- Subsequent runs are bit-for-bit identical to today.

Rollback: revert the `getModelRegistry()` body to `return modelRegistryRef;`. No on-disk state involved.

## Open Questions

1. **Should we add a console warning when the cold-start fallback is used?** Possible signal that something else (event ordering, SDK changes) is off. Lean: NO — adds noise without actionable diagnostics. If the canonical capture is broken, downstream code will surface that via its own paths.

2. **Should the subagents extension's similar `getModelRegistry()` (in `extensions/agent.ts`) be aligned syntactically?** It already reads `pi.modelRegistry` directly. Already aligned. No change there.

3. **Future:** if pi's SDK ever provides a synchronous `pi.getModelRegistry()` API with stronger ordering guarantees, this helper can collapse to a one-liner. Out of scope.
