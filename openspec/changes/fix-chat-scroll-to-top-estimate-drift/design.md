## Context

The chat transcript is a dynamic-height virtual list (`@tanstack/react-virtual`, change `virtualize-chat-transcript-tanstack`). Rows are heterogeneous (message bubbles, thinking blocks, tool bursts, images, inline terminals) with heights spanning ~24 px (turn separator) to several thousand px (a wall-of-text assistant message or a 24 k-char tool result). Off-screen rows are pre-measured by a static per-type estimate; real heights are cached by `measureElement` on mount.

Evidence (session `019f43e4`): the biggest rows sit near the top, and their static estimates under-shoot real height by 10–50×. When they mount during an upward scroll, `getTotalSize()` jumps and the container (`overflowAnchor:"none"`) does not preserve visual position, so the top recedes.

## Goals / Non-Goals

**Goals**
- Scrolling up converges on and lands on the first row (index 0).
- First-paint estimate error is small for large rows, so mount-time corrections are sub-perceptible.
- A deterministic scroll-to-top control exists as an escape hatch.

**Non-Goals**
- Perfect pre-measurement (impossible for async markdown/mermaid/image loads). We reduce error, then anchor-correct the residue.
- Changing rendered row output, the row model, or the bottom-pin/scroll-lock machinery.
- Fixing the known Cmd-F-over-off-screen-rows regression (tracked separately under the parent change).

## Decision 1 — Content-aware `estimateVirtualRowSize` (primary root-cause lever)

This is the fix that actually resolves the bug (see Decision 2 for why): shrinking the estimate error `delta` shrinks TanStack's built-in correction yank below perception. Replace static per-role constants with a payload-scaled estimate. Signal is already on the row:

- **Text rows** (user/assistant/toolResult/bashOutput/rawEvent): estimate ≈ `base + ceil(textChars / CHARS_PER_LINE) * LINE_PX`, clamped to a sane max so a 100 k-char row does not reserve 20 000 px (measurement will correct upward; the clamp just bounds the pre-measure reserve). Derive `textChars` from the same content the row renders (sum of text-block lengths).
- **Image presence** adds a fixed reserve equal to the CSS max render height of an inline image (bounded — images are capped by `max-h`, so their contribution is a constant, not payload-scaled).
- **Burst/group/separator/interactiveUi/inlineTerminal**: keep type constants (already close enough; their variance is small relative to text rows).

Must stay **O(1) per row, pure, memo-safe** — the estimate is called during windowing on every scroll. Precompute `textChars` once when `displayRows` is built (in the same `useMemo`) rather than re-walking content blocks inside `estimateSize`.

Open question: exact `CHARS_PER_LINE` / `LINE_PX` / clamp constants — derive from the real height distribution (reuse the umbrella's height-measurement fixture, or sample rendered heights in the repro session). Ship with conservative values and a comment; tune if drift persists.

## Decision 2 — Do not fight TanStack's built-in above-viewport correction

**Source finding (`@tanstack/virtual-core` `resizeItem`, `index.js:534`).** The virtualizer ALREADY anchor-corrects above-viewport rows by default: when a mounting row with `item.start < getScrollOffset()` measures larger by `delta`, it calls `_scrollToOffset(getScrollOffset(), { adjustments: scrollAdjustments += delta })` → `elementScroll` → `element.scrollTo({ top: scrollOffset + adjustments })`. A **manual** `scrollTop += delta` compensation would double-correct and make the jitter worse. So the correct decision is to NOT add manual math, and instead make the built-in correction imperceptible + not defeat it.

**Why the built-in still drifts at large `delta`.** `getScrollOffset()` returns `this.scrollOffset`, which is refreshed only by the scroll-event handler (`observeElementOffset`, debounced), NOT the live DOM `scrollTop`. During a continuous upward scroll, `this.scrollOffset` lags the DOM; a correction computes `scrollTo(staleOffset + delta)` and yanks the view back toward the last observed offset. The yank magnitude is proportional to `delta` (the estimate error). With a 96px estimate on a 2300px row, `delta ≈ +2204px` → the yank wipes out all upward progress → the top is unreachable. Shrink `delta` (Decision 1) → the yank falls below perception → the top becomes reachable. **Decision 1 is therefore the primary root-cause lever; this decision is corroborating hygiene.**

Actions:
- Keep TanStack's default `shouldAdjustScrollPositionOnItemSizeChange` (do NOT override it, do NOT add a parallel manual corrector).
- Preserve `overflowAnchor:"none"` on the container (verified present) and keep no `scroll-behavior: smooth` on the scroll container or ancestors (verified absent) — smooth would animate each synchronous correction and race the next.
- Ensure ChatView's own `scrollTop` writers do not clobber a scroll-locked position: the `onChange` bottom-pin and the auto-scroll `useLayoutEffect` already guard on `stickToBottomRef.current` (following only), so when scrolled up they do not run — confirm this invariant holds and add a regression test.
- Optional tuning (evaluate, only if drift persists after Decision 1): lower `isScrollingResetDelay` and/or set `useScrollendEvent: true` so `this.scrollOffset` refreshes sooner and the stale-offset window shrinks.

## Decision 3 — Scroll-to-top affordance

Mirror the existing scroll-to-bottom button:

- Render a scroll-to-top button when scrolled away from the top (symmetric to `showScrollButton`; add `showScrollTopButton` derived in `handleScroll` from `el.scrollTop > SCROLL_THRESHOLD`).
- Handler: `stickToBottomRef.current = false; virtualizer.scrollToIndex(0, { align: 'start' });` then let measurement anchoring (Decision 2) settle. Because `scrollToIndex(0)` re-targets on every measurement pass until the index is reached, it lands deterministically even with residual estimate error.
- Place it opposite the scroll-to-bottom button (top-right vs bottom-right) so both can be visible mid-scroll.

## Risks / Trade-offs

- **Estimate clamp vs. true tall rows.** Clamping the pre-measure reserve means a genuinely 8 000 px row is under-reserved until measured — the residual `delta` is absorbed by TanStack's built-in correction (Decision 2). The clamp must stay large enough that the residual yank is sub-perceptible; too small a clamp reintroduces the drift. Decision 1 and the built-in corrector are co-dependent.
- **Double-correction (the trap the first draft nearly shipped).** TanStack already fires the above-viewport correction. Adding a manual `scrollTop += delta` on top of it double-moves the view. Do NOT add manual compensation; assert in a test that a single upward mount produces a single net `scrollTop` change.
- **Bottom-pin interference.** ChatView's `scrollTop` writers (`onChange` pin, auto-scroll effect) must stay guarded on `stickToBottomRef.current` so they never run while scroll-locked and clobber the built-in correction.

## Migration / Rollback

Pure client change, no data/protocol impact. Rollback = revert the diff; behaviour returns to static estimates + top-scroll drift.

## Test Strategy

- Unit: `estimateVirtualRowSize` returns monotonically larger values for larger text payloads and adds the image reserve when an image block is present (pure-function tests, no DOM).
- Component (jsdom + `virtualizer-jsdom.ts` shim): mount a fixture transcript reproducing the repro profile (300 KB-image user row at index 4, 24 k-char toolResult mid-list); assert `scrollToIndex(0)` lands `scrollTop === 0` (first row top-aligned), that an upward mount above the viewport does not move the visible anchor by more than one row, and that a single such mount produces a **single** net `scrollTop` change (guards against a re-added manual corrector double-firing).
- Regression: the full `chat-scroll-lock` scenario suite must still pass (bottom-pin, 50px lock, scroll-to-bottom button, replay race).
