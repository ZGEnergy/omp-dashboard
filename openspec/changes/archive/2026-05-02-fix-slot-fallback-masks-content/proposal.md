## Why

After `2026-04-26-add-dashboard-shell-slots-runtime` shipped, the dashboard chat view (`sessionDetail`) silently disappeared whenever a session was selected. Bug discovered during deployment of `add-extension-ui-decorations` (session `019dc93e-ff44-7063-8083-3632afdebc2b`).

Root cause: in `packages/client/src/App.tsx` the `content-view` plugin slot was wired into the route fallback chain as

```tsx
(selectedId && selectedSession
  ? <ContentViewSlot session={selectedSession} routeParams={{}} onClose={…} />
  : null
) ?? sessionDetail ?? (…landing page…)
```

`<ContentViewSlot .../>` is a JSX element object — always truthy from `??`'s perspective, regardless of whether the slot returns `null` once React commits it. The `??` operator never sees the rendered output, so `sessionDetail` is unreachable for every user, every session, until at least one plugin claims the `content-view` slot. No production plugin claims it today; the demo plugin does, and only when fixtures are bundled — which is why the bug never showed up in CI but broke immediately in production after restart.

Hot-fix landed at the call site (gate on `_pluginRegistry.getClaims("content-view").length > 0` before constructing the element). This change captures that fix, adds a regression guard, and documents the anti-pattern so the four pending `extract-*-as-plugin` changes do not reintroduce it when they integrate `command-route`, `anchored-popover`, or other React-element-yielding slots into similar fallback chains.

## What Changes

- **NEW**: Repository lint test `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts` that scans `packages/client/src/App.tsx` for the anti-pattern `<\w+Slot[^>]*/>\s*\)?\s*\?\?` and fails with the offending file:line. Mirrors the existing `no-direct-process-kill.test.ts` lint pattern.
- **NEW**: Behavior test `packages/client/src/__tests__/content-view-slot-fallback.test.tsx` that renders the gating expression with `claimCount = 0` and asserts the fallback element is rendered (not the slot wrapper). Pinpoints the exact bug shape.
- **MODIFIED**: `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` — extract a tiny pure helper `gateSlotElement<T>(hasClaims: boolean, element: T): T | null` and re-export it from the runtime barrel. Existing call sites can opt into the helper to make the gating explicit; the lint test continues to enforce the convention at the call site regardless.
- **DOCS**: Add a "JSX slot wrappers and `??` fallback chains" subsection in `docs/architecture.md` § "Dashboard plugin shell" describing the anti-pattern + the lint test guarantee.
- **DOCS**: Cross-link this change from `openspec/changes/archive/2026-04-26-add-dashboard-shell-slots-runtime/` (post-archive note) and from each `extract-*-as-plugin/proposal.md` so the four pending extractions inherit the guardrail.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard-shell-slots`: add a Requirement banning the JSX-slot ↔ `??` anti-pattern in shell call sites, enforced by the lint test.

## Impact

- `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts` (new lint).
- `packages/client/src/__tests__/content-view-slot-fallback.test.tsx` (new behavior test).
- `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` (export `gateSlotElement` helper; non-breaking).
- `packages/dashboard-plugin-runtime/src/index.ts` (barrel re-export).
- `packages/client/src/App.tsx` (already fixed at runtime; this change captures the convention. Optionally migrate the call site to use `gateSlotElement` for clarity — opt-in cleanup, not required for the lint to pass.)
- `docs/architecture.md` (anti-pattern note).
- `openspec/specs/dashboard-shell-slots/spec.md` (delta: ban anti-pattern).

## References

- Live bug fix landed in `packages/client/src/App.tsx` (line 1512) during session `019dc93e-ff44-7063-8083-3632afdebc2b`, deployed alongside `add-extension-ui-decorations`.
- Affected slot consumer: `ContentViewSlot` in `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` — itself returns `null` correctly when claims are empty; the bug is that React's `??` evaluates the JSX *element*, not the rendered output.
- Original change that introduced the wiring: `openspec/changes/archive/2026-04-26-add-dashboard-shell-slots-runtime/`.
- Pending downstream changes that must respect the convention: `extract-flows-as-plugin`, `extract-openspec-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`.
