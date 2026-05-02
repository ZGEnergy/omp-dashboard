## Context

`2026-04-26-add-dashboard-shell-slots-runtime` added `<ContentViewSlot/>` to `packages/client/src/App.tsx` as part of the route fallback chain. The intended semantics: if a plugin has claimed the `content-view` slot, render that plugin's view; otherwise fall through to `sessionDetail` (the chat view), and finally to the landing page.

The original wiring used a JavaScript `??` chain to express this fallthrough:

```tsx
(selectedId && selectedSession
  ? <ContentViewSlot session={selectedSession} routeParams={{}} onClose={…} />
  : null
) ?? sessionDetail ?? <LandingPage … />
```

The runtime symptom: chat view never rendered for any session. Discovered during deployment of `add-extension-ui-decorations` (session `019dc93e-ff44-7063-8083-3632afdebc2b`).

## Root cause

`??` operates on the **value** in its left operand, which for JSX is always a React element object (truthy) — never the rendered output. `<ContentViewSlot/>` returns `null` once mounted (when no plugins claim the slot), but `??` has already chosen the truthy element by then, so React renders nothing visible *and* `sessionDetail` is unreachable.

The slot consumer itself (`packages/dashboard-plugin-runtime/src/slot-consumers.tsx:91`) correctly returns `null` when claims are empty:

```tsx
const claims = registry.getClaims("content-view");
if (!claims.length) return null;
```

…but the consumer-internal `null` cannot rescue a `??` chain that's already committed to the truthy JSX element.

## Goals / Non-Goals

**Goals**

- Capture the hot-fix in a permanent change record so the rationale survives cherry-picks.
- Add a regression test that reproduces the exact bug shape and pins the fix semantics.
- Add a repository lint that scans `packages/client/src/App.tsx` for the anti-pattern and fails with file:line. Mirrors `no-direct-process-kill.test.ts` style.
- Document the anti-pattern in `docs/architecture.md` so the four pending `extract-*-as-plugin` changes (`flows`, `openspec`, `subagents`, `git`) inherit the guardrail before they wire `command-route`, `anchored-popover`, etc. into similar fallback chains.

**Non-Goals**

- Refactoring `App.tsx` to remove the `??` chain. The chain is idiomatic; only the slot integration needed gating. Future slots can use the same gated shape.
- A general-purpose ESLint rule. Vitest-based lint tests are sufficient and live with the rest of our repo-level lints.
- Static analysis of every `*Slot` consumer's null-return semantics. The lint catches the call-site shape; the consumer's own implementation is covered by its own unit tests.

## Decisions

### 1. Lint over runtime guard

Two viable approaches:

| Option | Pro | Con |
|---|---|---|
| **(a) Static lint** scanning `App.tsx` (and future shell files) for `<*Slot/>` adjacent to `??` without a `getClaims(/length` gate | Fast, no runtime cost, fails CI immediately | Regex-based; small false-positive / false-negative surface |
| (b) Runtime guard via a `gateSlot()` helper that always wraps the JSX | Type-safe; can't be mis-used | Adds an abstraction at every slot site; doesn't catch raw `<Slot/> ?? …` |

**Adopt (a).** The buggy pattern is a *call-site convention* problem, not a primitive missing. A two-stage regex (cap the slot-tag span, then forbid anything but ternary-tail tokens between `/>` and `??`, then verify the lookback contains `getClaims(` or `.length [><=]`) catches both shapes:

```tsx
<Slot/> ?? fb                          // direct
(cond ? <Slot/> : null) ?? fb          // ternary-wrapped (the production bug)
```

Tested for both true positives and false positives (sibling-mounted `<ToastSlot/>`, gated `<ContentViewSlot/>`).

### 2. No abstraction at the call site

The fix in `App.tsx` is a one-token addition (`getClaims("content-view").length > 0`). Wrapping it in `gateSlotElement(claims, <Slot/>)` would obscure the JSX and add an abstraction barrier for negligible benefit. The lint test enforces the convention; the convention itself remains plain inline JSX.

We initially considered exporting a `gateSlotElement` helper from the runtime barrel; dropped because:
- It can't catch the raw shape (`<Slot/> ?? fb`) without the lint, so the lint is doing the load-bearing work either way.
- Future slot wiring (in the four pending `extract-*-as-plugin` changes) is more readable as plain JSX with a clear gate condition than as a helper invocation.

### 3. Regression test mirrors the actual bug

`content-view-slot-fallback.test.tsx` documents three states:

1. The **broken pattern** — renders nothing (proving the bug exists when the gate is missing).
2. The **fixed pattern** with `claimCount = 0` — renders the fallback element.
3. The **fixed pattern** with `claimCount = 1` — renders the slot (no happy-path regression).

This tests the *semantics* of the fix in isolation. The lint test then guarantees the convention is followed at every shell call site.

### 4. Lint scope

Currently scans `packages/client/src/App.tsx` only. As the four `extract-*-as-plugin` changes land and add slot wiring to other shell files (e.g. `MobileShell.tsx`, `SettingsPanel.tsx`), maintainers add the file path to `SCAN_FILES` in `no-jsx-slot-nullish-fallback.test.ts`. The list is intentionally explicit so unrelated test/fixture files don't get scanned.

## Risks / Trade-offs

- **Risk:** Regex false-negatives — the cap on slot-tag span (300 chars) could let a very long multi-attribute slot escape. → Mitigation: in practice, slot consumer props are 2-4 attributes; 300 chars is generous. If a slot grows past it, the test fixture catches it (we test the matcher against shapes, not just file content).
- **Risk:** Regex false-positives — a sibling-mounted slot followed (via unrelated nested expressions) by a far-away `??`. → Mitigation: the inter-token character class `[\s:)null]` rejects `<`, `{`, `;`, etc., so sibling JSX doesn't match. Unit tests cover this case (`ToastSlot` followed by an `extensionModuleOpen && (() => …)` block was the first false positive caught and fixed).
- **Risk:** Lookback for `getClaims(`/`.length [><=]` matches an unrelated check elsewhere in the file within 120 chars. → Mitigation: 120-char lookback is tight enough to scope to the enclosing ternary only. Tested against the actual production-bug shape (which had `selectedFlows.length > 0` ~450 lines away — outside the 120-char window).
- **Trade-off:** Regex-based lint vs an AST/ESLint rule. AST would be more robust but require a custom ESLint plugin and a much heavier maintenance surface. Vitest regex lint matches the existing repo convention (`no-direct-process-kill.test.ts`, `no-direct-child-process.test.ts`, `no-raw-node-import.test.ts`) and is sufficient for the small set of shell files involved.

## Migration Plan

This change is purely additive. No App.tsx modifications beyond the hot-fix already deployed. Rollout:

1. Land the regression test + lint in `packages/client/src/__tests__/`. CI catches any future regression.
2. Add the anti-pattern note to `docs/architecture.md` § Dashboard plugin shell.
3. Update `openspec/specs/dashboard-shell-slots/spec.md` with a Requirement banning the anti-pattern.
4. Cross-link from `extract-*-as-plugin/proposal.md` so each pending extraction inherits the guardrail.

Rollback: revert the test files. The hot-fix in App.tsx remains regardless (it's required for correctness).

## Open Questions

None. The lint scope (file allowlist), regex shape, and lookback window are all parameters with sane defaults; tightening them is a follow-up if a false positive ever fires.
