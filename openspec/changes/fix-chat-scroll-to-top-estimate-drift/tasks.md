## 1. Reproduce + baseline

- [ ] 1.1 Build a test fixture transcript reproducing the repro profile from session `019f43e4`: a user row with a ~300 KB image block + ~9 k chars near the top (index ~4), a ~24 k-char toolResult mid-list, plus normal rows. Keep it as a shared fixture for the tests below.
- [ ] 1.2 (`systematic-debugging`) With the fixture mounted in the isolated UI, confirm the failure first: scrolling up does not converge on index 0. Capture the `getTotalSize()` jump on top-row mount as the "before" evidence.

## 2. Content-aware estimate (Decision 1)

- [ ] 2.1 In the `displayRows` `useMemo` (ChatView), precompute per-row `textChars` (sum of rendered text-block lengths) and an `hasImage`/`hasInlineTerminal` flag; carry them so `estimateSize` reads precomputed data, not content walks.
- [ ] 2.2 Rewrite `estimateVirtualRowSize` in `packages/client/src/lib/chat-virtual-rows.ts` to `base + ceil(textChars / CHARS_PER_LINE) * LINE_PX` (clamped) for text rows, plus a fixed image reserve when an image block is present; keep type constants for burst/group/separator/interactiveUi/inlineTerminal. Pure, O(1).
- [ ] 2.3 TDD: unit tests — estimate is monotonic in text length (up to clamp), and adds the image reserve for image-bearing rows. No DOM.
- [ ] 2.4 Derive `CHARS_PER_LINE` / `LINE_PX` / clamp from the real height distribution (reuse the umbrella height fixture or sample the repro session); document chosen constants inline.

## 3. Do not fight the built-in correction (Decision 2)

- [ ] 3.1 Keep TanStack's default above-viewport correction: do NOT override `shouldAdjustScrollPositionOnItemSizeChange` and do NOT add a manual `scrollTop += delta` corrector (the built-in `resizeItem` at `virtual-core index.js:534` already fires it; a second one double-moves the view).
- [ ] 3.2 Verify the non-defeat invariants: `overflowAnchor:"none"` stays on the scroll container, and no `scroll-behavior: smooth` on it or an ancestor (both currently hold — add a guard/comment so a later change doesn't reintroduce smooth).
- [ ] 3.3 (`doubt-driven-review`) Confirm ChatView's own `scrollTop` writers stay guarded on `stickToBottomRef.current` (the `onChange` bottom-pin + the auto-scroll `useLayoutEffect`) so neither runs while scroll-locked and clobbers the built-in correction.
- [ ] 3.4 TDD: component test (jsdom + `virtualizer-jsdom.ts` shim) — mounting an above-viewport row that measures 10× its estimate moves the visible anchor by ≤ one row height AND produces a SINGLE net `scrollTop` change (regression guard against a re-added manual corrector).
- [ ] 3.5 Optional, only if drift persists after Decision 1 lands: evaluate lowering `isScrollingResetDelay` and/or `useScrollendEvent:true` so the virtualizer's `scrollOffset` refreshes sooner (shrinks the stale-offset window). Measure before/after; skip if Decision 1 already makes the top reachable.

## 4. Scroll-to-top affordance (Decision 3)

- [ ] 4.1 Derive `showScrollTopButton` in `handleScroll` from `el.scrollTop > SCROLL_THRESHOLD`; render a scroll-to-top button symmetric to the scroll-to-bottom button (top-right).
- [ ] 4.2 Handler: `stickToBottomRef.current = false; setShowScrollButton(true); virtualizer.scrollToIndex(0, { align:'start' });`.
- [ ] 4.3 TDD: `scrollToIndex(0)` on the repro fixture lands `scrollTop === 0` (first row top-aligned) even with under-estimated tall rows above.
- [ ] 4.4 TDD: activating scroll-to-top while streaming keeps the view scroll-locked (not pulled back to bottom) — spec scenario "Scroll-to-top does not fight the bottom-pin".

## 5. Regression gate

- [ ] 5.1 Run the full `chat-scroll-lock` scenario suite (bottom-pin, 50px lock, scroll-to-bottom button, multi-batch replay race) — all must pass unchanged.
- [ ] 5.2 Run `ChatView.scroll-race.test.tsx` and the virtualization tests; confirm no regressions.
- [ ] 5.3 `npm test 2>&1 | tee /tmp/pi-test.log` then `grep -nE 'FAIL|Error|✗' /tmp/pi-test.log` — green.

## 6. Manual / e2e verification

- [ ] 6.1 In the isolated UI (or Playwright e2e), load a long real session, scroll up from the bottom, confirm the first message reaches full view and the scroll-to-top button lands on it.
- [ ] 6.2 Verify scroll-to-bottom still works and streaming still pins while following.

## 7. Docs

- [ ] 7.1 Update `packages/client/src/lib/chat-virtual-rows.ts` and `ChatView.tsx.AGENTS.md` rows with the content-aware estimate + scroll-to-top + anchor-correction notes and `See change: fix-chat-scroll-to-top-estimate-drift`.
