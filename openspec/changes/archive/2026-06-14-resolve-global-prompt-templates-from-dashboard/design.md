## Context

Salvaged from archived `fix-slash-dispatch-delivery` (Decision 3 + Decision 5). Codebase had diverged: delivery plumbing and Path D error feedback landed via PR #30 and `enable-rpc-keeper-by-default`, but the prompt-template resolution and `hasDispatchCommand` fallback were never applied.

## Decisions

### Decision 1: `resolveTemplate` queries `pi.getCommands()` for `source: "prompt"`

`resolveTemplate` Step 3 currently does `commands.find(c => c.name === cand && c.source === "skill" && c.path)`. Add a parallel probe for `source: "prompt"` immediately after, inside the same candidate-name loop so original-form-first precedence holds. Reuse whatever path field the existing skill probe reads (current code uses `c.path`; keep it consistent — do NOT switch to `sourceInfo.path` unless the skill probe also uses it). `pi.getCommands()` already returns prompt templates (global + project + package) with their absolute paths, so no directory scan is added; one extra O(n) `.find()` on the same array.

### Decision 2: `hasDispatchCommand` adds `in`-operator fallback

Keep the fast path `typeof (pi as any)?.dispatchCommand === "function"`. When that is false, fall back to `pi != null && "dispatchCommand" in (pi as object)` with a guarded `typeof` on the resolved value, so getter-backed / Proxy-hidden functions still detect. Still returns `false` for `null`/`undefined` pi and for non-function values. No version-sniffing.

## Non-Goals

- Re-litigating Path D wording (already shipped; keeper is always-on, config knob removed).
- Touching delivery plumbing (landed).
- Directory scanning for prompt templates (`pi.getCommands()` already carries paths).

## References

- Archived `fix-slash-dispatch-delivery` — Decisions 3 & 5.
- `packages/extension/src/prompt-expander.ts` Step 3.
- `packages/extension/src/bridge-context.ts::hasDispatchCommand`.
