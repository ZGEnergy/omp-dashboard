## Context

The `ChatView` component currently auto-scrolls to the bottom unconditionally whenever `state.messages.length`, `state.streamingText`, or `state.pendingPrompt` changes. Users reading earlier messages lose their position when new content arrives.

## Goals / Non-Goals

**Goals:**
- Pause auto-scroll when the user scrolls away from the bottom
- Resume auto-scroll when the user returns to the bottom
- Provide a floating button to jump to bottom and resume following

**Non-Goals:**
- Unread message count or badge on the button
- Persisting scroll position across session switches
- Smooth-scroll animation for auto-scroll (only for user-initiated jump)

## Decisions

### 1. Use a ref for "near bottom" tracking, state for button visibility

**Decision:** Track `isNearBottom` with a `useRef` (avoids re-renders on every scroll tick). Derive `showScrollButton` as `useState` toggled by the scroll handler (only updates when crossing the threshold boundary).

**Why not all-state?** Scroll events fire at 60fps during scrolling. Using state for the near-bottom flag would trigger re-renders on every frame.

**Why not all-ref?** The button needs to show/hide reactively, so button visibility must be state.

### 2. Threshold of 50px for "near bottom" detection

**Decision:** The user is considered "at the bottom" if `scrollHeight - scrollTop - clientHeight < 50`.

50px is small enough to feel like "at the bottom" but large enough to account for sub-pixel rounding and minor touch inertia.

### 3. Scroll listener via onScroll prop

**Decision:** Use React's `onScroll` on the scroll container div rather than `addEventListener`.

Simpler, automatically cleaned up, and passive by default in React.

### 4. Floating button positioned inside the scroll container's parent

**Decision:** Wrap the scroll div in a `relative` container. Place the button as an `absolute` sibling at `bottom-4 left-1/2 -translate-x-1/2`. Button uses `scrollRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' })` and sets `isNearBottom.current = true`.

### 5. All logic stays in ChatView.tsx

**Decision:** No new files or hooks. The feature is ~20 lines of logic — a scroll handler, a conditional in the existing useEffect, and a button element.

**Why not a custom hook?** Extracting `useScrollLock` would be premature. If more components need this pattern later, it can be extracted then.

## Risks / Trade-offs

- **[Risk] Scroll event performance** → The handler only compares three numbers and conditionally sets state. No DOM reads beyond the scroll container's own properties. Negligible cost.
- **[Risk] Mobile touch inertia** → Momentum scrolling may fire scroll events after the user lifts their finger. The 50px threshold accommodates this, and the button provides an escape hatch.
- **[Trade-off] No unread indicator** → Keeping scope minimal. Can be added later without changing the scroll-lock mechanism.
