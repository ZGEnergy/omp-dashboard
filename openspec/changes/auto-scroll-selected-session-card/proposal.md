## Why

When the currently selected session's card moves position in the sidebar — because its status flipped (e.g. `active` → `ended`), it was hidden, the move-to-front policy fired on reattach, or the user dragged-to-resume from another zone — the card frequently scrolls out of view in the `SessionList`. The chat view in the main pane keeps showing the session, but the user loses sight of *which* card now represents it and where it went. There is no automatic re-centering today.

This is most disorienting on tall lists with many folders, on the move-to-front bridge-reattach transitions (`reattach-move-to-front`), and on the unread-stripe / status-change pulses (`session-card-unread-stripes`, `top-of-tier-on-status-change`) which already deliberately reorder the selected card.

## What Changes

- `SessionList` keeps the currently-selected card in view automatically, but ONLY when the card moves under the user — not when the user changes the selection.
  - Scroll WHEN the position of the currently-selected card changes due to a background state transition: `status` flip, `hidden` toggle, `cwd` change (folder move), or any change to `sessionOrderMap` for its folder.
  - Scroll ONCE on first mount if a `selectedId` is already set (deep-link arrival on `/session/:id`), so the user lands on a viewport showing the card.
  - DO NOT scroll on subsequent `selectedId` changes (user clicked a different card, programmatic selection switch). The user knows what they clicked; auto-scrolling on click is at best redundant and at worst hijacks their scroll position.
- Scroll uses `scrollIntoView({ block: "nearest" })` so it is a no-op when the card is already visible (no jitter).
- Scroll behavior is always `auto` (instant). There is no user-initiated trigger that warrants smooth animation.
- Folder collapse and the Hidden disclosure are NOT auto-expanded. If the selected card lives inside a collapsed folder or behind the Hidden toggle, the chat view still shows the session — auto-expanding fights the user's explicit collapse and is out of scope here.
- Adds `data-session-id="<id>"` to each card root so the effect can locate the selected element with a single `querySelector`, avoiding ref-plumbing through `SortableSessionCard` / `dnd-kit`.
- Adds a pure helper `selectedCardScrollFingerprint(selectedId, sessions, sessionOrderMap): string | null` as the test seam.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `session-card-selection`: adds requirements that the selected card is auto-scrolled into view on selection change AND on state-driven position changes of the selected session, plus a pure helper contract and a `data-session-id` DOM-addressing requirement.

## Impact

- Code:
  - `packages/client/src/components/SessionList.tsx` — adds a list-container ref, a memoized `scrollFingerprint`, and a `useEffect` that calls `scrollIntoView` on the selected card.
  - `packages/client/src/components/SessionCard.tsx` — adds `data-session-id={session.id}` on the card root.
  - Optional new file `packages/client/src/lib/session-list-scroll.ts` for the pure helper if the in-component placement reads cluttered.
- No protocol, server, or persistence changes.
- No new dependencies.
- Risk surface:
  - Wide effect dependency list (via fingerprint string) is mitigated because `scrollIntoView({ block: "nearest" })` is idempotent for already-visible elements.
  - `behavior: "smooth"` during rapid user click-throughs is browser-native and is naturally interrupted by the next call.
- Tests: the pure fingerprint helper is unit-testable; DOM scroll itself is covered by an integration-style render test that asserts `scrollIntoView` is called on the matching `[data-session-id]` element.
