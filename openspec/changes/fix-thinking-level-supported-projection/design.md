# Design

## Decision: reuse pi's `getSupportedThinkingLevels` instead of a local projection

The bridge must produce the same "supported levels" set that pi core uses to
clamp thinking level (`clampThinkingLevel` → `getSupportedThinkingLevels`).
Re-deriving it locally is what caused the divergence. The bridge already depends
on `@earendil-works/pi-ai/compat` (pi core imports the same symbol there), so the
fix is to call the canonical function rather than reimplement its contract.

```ts
// packages/extension/src/provider-register.ts
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";

// in toModelInfo(m):
const supportedThinkingLevels =
  hasThinkingMetadata(m) ? getSupportedThinkingLevels(m) : undefined;
```

## `thinkingLevelMap` contract (why the old projection was wrong)

`thinkingLevelMap` is a **sparse override**, not an allowlist:

| map entry | meaning |
|-----------|---------|
| key absent | level supported by default (reasoning models) |
| key → string | level supported, remapped to a vendor value |
| key → `null` | level explicitly disabled |
| `xhigh` | special: supported only if the key is present (any non-null value) |

pi's rule:

```
!reasoning                → ["off"]
reasoning                 → keep every EXTENDED level unless map[level] === null,
                            except xhigh which needs map[xhigh] !== undefined
```

Old dashboard rule (`Object.entries(map).filter(v !== null)`) enumerates only the
**declared** keys — correct only for a dense map, wrong for sparse maps (Opus).

## Fallback / undefined semantics

`supportedThinkingLevels` stays **optional**. The client's `ThinkingLevelSelector`
renders all six canonical levels when the field is `undefined` or empty. To
preserve that fallback for pre-0.72 pi (models with neither `reasoning` nor
`thinkingLevelMap`), `toModelInfo` emits the field only when the model exposes
thinking metadata; otherwise it omits it. Rationale: forcing `["off"]` on a model
whose metadata is simply unknown would over-restrict; the existing "show all"
fallback is the safer default there.

## Non-goals

- No change to the persisted thinking level or to pi's clamp behavior (pi is
  correct). No re-clamp on model switch is added — pi already does that.
- No change to the `set_thinking_level` / `model_update` protocol or to the
  two-surface propagation requirement.
- No UI redesign of the trigger label. Once the dropdown is correct, `high`
  becomes a member of the supported set and the perceived inconsistency is gone.

## Edge cases / test matrix

| model metadata | expected `supportedThinkingLevels` |
|----------------|-------------------------------------|
| `reasoning:true, map:{ xhigh:"xhigh" }` (Opus) | `[off, minimal, low, medium, high, xhigh]` |
| `reasoning:true, map:{ medium, high, xhigh:null }` | `[off, minimal, low, medium, high]` |
| `reasoning:false` | `[off]` |
| `reasoning:true`, no map | all six (via `getSupportedThinkingLevels`) |
| no reasoning flag, no map (pre-0.72) | `undefined` → client shows all six |
