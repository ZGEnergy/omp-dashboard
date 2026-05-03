## Context

`SessionList` is the only sidebar component used by `App.tsx` (`SessionSidebar.tsx` is dead — only its own test imports it). Cards render through `SortableSessionCard` → `SessionCard`. The list lives in a scrollable container.

Three recently-landed mechanisms now move the selected card around without user input:

- `top-of-tier-on-status-change` — ended → alive transitions move the card to the top of the alive tier via `sessionOrderManager.moveToFront`.
- `reattach-move-to-front` — bridge reattach on dashboard restart applies the configured `reattachPlacement` policy.
- `session-card-unread-stripes` — unread bit can flip while the user is on the card.

Plus the long-standing transitions: `status` flips active ↔ ended, `hidden` toggles, drag-to-resume across zones.

In all those cases, `selectedId` in `App.tsx` is unchanged — the user is still "on" the session — but its rendered position can shift to anywhere in the list, including off-screen.

ChatView already has a precedent for programmatic scroll (`chatViewRef.current.scrollToTurn(turnIndex)` at `App.tsx:931`). We're applying the same pattern at the sidebar level.

## Goals / Non-Goals

**Goals:**

- Keep the currently-selected card within the visible viewport of `SessionList` when the card moves under the user due to a background state change: `status` / `hidden` / `cwd` change, or its index inside its folder's `sessionOrderMap` slice changes.
- One-shot scroll on first mount if a `selectedId` is already set (deep-link arrival on `/session/:id`), so the user lands on a viewport showing the card.
- DO NOT scroll on subsequent `selectedId` changes — the user just clicked or programmatically navigated; auto-scrolling on click hijacks their scroll position and is unnecessary because they already know where the card is (they just clicked it).
- No-op when the card is already visible (`scrollIntoView({ block: "nearest" })` semantics).
- Always `behavior: "auto"` (instant). No user-initiated trigger warrants animation.
- Provide a pure helper extractable for unit tests so we don't depend on jsdom layout to verify the trigger logic.

**Non-Goals:**

- Auto-expand collapsed folders or the Hidden disclosure to reveal a card that has scrolled into a collapsed bucket. The chat view still shows the session; auto-expanding fights the user's explicit collapse.
- Auto-expand the per-folder Ended bucket when the selected session ends.
- Special handling for cards filtered out by `sessionSearch` / `workspaceFilter` — they have no DOM, the effect noops.
- Mobile-specific behavior. `MobileShell` hides the list panel via CSS `transform`; `overflow-y` scroll on the inner panel still works, so the same effect just-works on mobile.
- Any change to `SessionSidebar.tsx` (dead code).
- Any protocol, server, or persistence change.

## Decisions

### D1: DOM lookup via `data-session-id`, not ref-forwarding

`SortableSessionCard` wraps `SessionCard` with `dnd-kit`'s `useSortable`. Threading a ref from `SessionList` through to the card root would require `forwardRef` on both layers and merging with `dnd-kit`'s `setNodeRef`.

Instead: stamp `data-session-id={session.id}` on the card root and locate it from a list-container ref:

```ts
const el = listRef.current?.querySelector(`[data-session-id="${selectedId}"]`);
```

Trade-off: a `querySelector` per effect run vs. avoided ref plumbing. With `block: "nearest"` the effect is rare enough that the cost is irrelevant.

**Alternative considered**: ref forwarding through `SortableSessionCard`. Rejected — touches three components for ergonomic reasons only, and the dnd-kit `setNodeRef` merge is a known footgun.

### D2: Effect trigger is a "scroll fingerprint" string

Instead of listing every relevant prop in the effect's deps array, derive a single fingerprint string in `useMemo` and key the effect on it:

```ts
function selectedCardScrollFingerprint(
  selectedId: string | undefined,
  sessions: DashboardSession[],
  sessionOrderMap: Map<string, string[]> | undefined,
): string | null {
  if (!selectedId) return null;
  const s = sessions.find((x) => x.id === selectedId);
  if (!s) return null;
  const order = sessionOrderMap?.get(s.cwd);
  const orderIdx = order?.indexOf(selectedId) ?? -1;
  return `${selectedId}|${s.status}|${s.hidden ? 1 : 0}|${s.cwd}|${orderIdx}`;
}
```

Properties:

- Only changes when something position-affecting for THIS card changes.
- Pure — unit-testable without jsdom or `scrollIntoView` mocks.
- Filtered out / missing session → returns `null` → effect noops.
- Independent of folder collapse state, ended-bucket toggle, search, hidden-section toggle (all of which can hide the card; the effect noops via `querySelector` returning `null`).

**Alternative considered**: depend on whole `sessionOrderMap` and the selected session object. Works, but fires the effect on every reorder of every folder. With idempotent `scrollIntoView` it would be harmless but noisier and harder to reason about in tests.

### D3: Suppress scroll when only `selectedId` changed

The effect must distinguish two cases triggered by the same fingerprint change:

1. `selectedId` itself changed — user click or programmatic selection. **Do not scroll.**
2. Some other position-affecting field changed for the unchanged `selectedId` — background re-sort. **Scroll.**

Use a `useRef<string | undefined>` to remember the prev `selectedId`:

```ts
const prevSelectedRef = useRef<string | undefined>(selectedId);
// inside the effect:
const selectionChanged = prevSelectedRef.current !== selectedId;
prevSelectedRef.current = selectedId;
if (selectionChanged && !isFirstMount) return; // suppress on user click
// otherwise scroll
```

First-mount handling: a second `useRef<boolean>(true)` guards the deep-link case. On the first effect run, scroll if `selectedId` is set (deep-link), then flip the ref to `false`. Subsequent `selectedId` changes are suppressed.

Scroll behavior is always `"auto"`.

**Alternative considered**: scroll on every fingerprint change, smooth on click and auto on background. Rejected per user feedback — click-to-scroll hijacks the user's scroll position and provides no value (they already see the card they clicked).

### D4: `useEffect`, not `useLayoutEffect`

Initial-mount deep-link (`/session/:id`) introduces a one-frame delay before scroll. `useLayoutEffect` would scroll pre-paint, but:

1. The flash is ~16 ms during a fresh page load — imperceptible against the rest of the render.
2. If the card is in a collapsed folder, neither variant has DOM to scroll to.
3. `useLayoutEffect` blocks paint and would re-run on every state-driven trigger.

Plain `useEffect` is the right tool.

### D5: Folder/Hidden auto-expand stays out of scope (re-stating from proposal)

If the selected card slides into a collapsed Ended bucket or a collapsed folder, `querySelector` returns `null` and we noop. The user can still see the session in the chat panel; the sidebar correctly reflects the user's collapse choices.

## Risks / Trade-offs

- **Risk**: A misuse of `querySelector` with an unsafe id selector → CSS-injection-style breakage.
  **Mitigation**: session ids are server-generated UUIDs with `[-0-9a-zA-Z]` charset. Use the literal id in the attribute selector; if defense-in-depth is wanted, swap to `querySelectorAll` + `Array.find` matching by `getAttribute`. Tasks include the cheap-but-paranoid version.

- **Risk**: Effect fires while the user is mid-drag in `dnd-kit` and yanks the list under them.
  **Mitigation**: `dnd-kit` uses transforms during drag; `scrollIntoView` doesn't fight transforms. If proven jarring in QA, gate the effect on `!isDragging`. Track as a "if observed" follow-up only.

- **Risk**: `behavior: "smooth"` on rapid `selectedId` changes feels laggy.
  **Mitigation**: Browsers naturally cancel an in-flight smooth scroll when a new one is requested. Acceptable.

- **Trade-off**: The fingerprint deliberately omits `currentTool`, `tokensIn/Out`, model, and similar fields. Those don't move the card, so they're correctly out of the dep set; the effect doesn't fire on tool-execution events even though `sessions` is a new reference.

## Migration Plan

Pure UI behavior change. No flags, no rollout staging. Revert is a single-component change.

## Open Questions

None blocking implementation. The dnd-kit drag-interaction edge case is a "if observed" follow-up.
