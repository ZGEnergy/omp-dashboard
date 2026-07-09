## Why

Users cannot reliably scroll to the **top** of a virtualized chat transcript on real sessions. Reproduced from session `019f43e4-65b3-70bc-a071-a2241882f295`: scrolling up never converges on the first message — the top keeps receding as you climb.

**Root cause: content-blind row-height estimates in a dynamic-height virtual list, with the largest rows concentrated near the top.** The transcript is windowed by `@tanstack/react-virtual` (change `virtualize-chat-transcript-tanstack`). Off-screen rows are pre-measured by `estimateVirtualRowSize` in `packages/client/src/lib/chat-virtual-rows.ts`, which returns a **static per-role constant** (`user: 96`, `toolResult: 120`, `assistant: 140`, …). Those constants do not reflect payload size. Evidence from the reproducing session:

| line | role | real content | estimate | under-estimate |
|---|---|---|---|---|
| L5 | user | 9 240 chars text **+ 294 KB pasted image** | 96 px | ~24× (text alone) |
| L126 | toolResult | 24 071 chars | 120 px | up to ~50× |
| L125 | assistant | 16 931-char thinking block | 140 px | large |

- 156 records total (event cap is 20 000 — **not** a server-side head-trim; that hypothesis was checked and cleared).
- Median record 1.7 KB, **max 303 KB**; top-5 records = 48% of the transcript's bytes.
- The single biggest row (L5) is the 5th from the top.

Mechanism: as you scroll up, those top rows mount, `measureElement` reports the true (10–50× larger) height, `getTotalSize()` jumps by thousands of px, and — with `overflowAnchor:"none"` on the container — the browser does not hold position; TanStack re-corrects `scrollTop` a frame later. The top boundary recedes faster than the user climbs, so index 0 never lands.

This is a real, shipped-behaviour regression inherent to Step B windowing; Step A (`content-visibility`) did not have it because every row stayed mounted and measured.

## What Changes

Three complementary fixes in `ChatView.tsx` + `chat-virtual-rows.ts`, root-cause first:

1. **Content-aware size estimates (primary fix).** Replace the static per-role constants in `estimateVirtualRowSize` with estimates scaled by the row's payload — text length (chars → rough line count) and presence of an image/inline-terminal/bash block. TanStack already anchor-corrects above-viewport rows on measurement (`virtual-core resizeItem`), but its correction reads a stale `scrollOffset` and yanks the view proportional to the estimate error `delta`; with a 96px estimate on a 2300px row that yank (~2200px) wipes out upward progress. Shrinking `delta` shrinks the yank below perception, so the top becomes reachable. This is the root-cause lever.

2. **Do not fight the built-in correction.** Keep TanStack's default above-viewport adjustment — do NOT add a manual `scrollTop += delta` (it would double-correct). Preserve `overflowAnchor:"none"` (present) and keep no `scroll-behavior: smooth` on the container (absent); keep ChatView's own `scrollTop` writers guarded on `stickToBottomRef` so they never clobber a scroll-locked position. Optionally tune `isScrollingResetDelay`/`useScrollendEvent` only if drift persists after fix 1.

3. **Deterministic "scroll to top" affordance.** Add a scroll-to-top control (mirroring the existing scroll-to-bottom button) that calls `virtualizer.scrollToIndex(0, { align: 'start' })`. It goes through the alignment path and re-targets each measurement pass, sidestepping the incremental stale-offset trap, so it lands on the first row regardless of residual estimate error; it suspends auto-scroll-follow like `scrollToTurn`.

Fix 1 is the root-cause resolution; fix 2 keeps us from re-introducing jitter; fix 3 guarantees the user can always reach the top.

## Capabilities

### Modified Capabilities
- `chat-transcript-virtualization`: tighten the "preserves scroll and streaming semantics" requirement to guarantee the user can scroll to and land on the first row without divergence, add a content-aware-estimate requirement bounding first-paint estimate error, and add a scroll-to-top affordance requirement.

### Unchanged (must be preserved, not modified)
- `chat-scroll-lock` — 50px lock threshold, scroll-to-bottom button, multi-batch `event_replay` race behavior.
- Bottom-pin auto-scroll, `scrollToTurn`, per-session scroll restore — all continue to work; the estimate change only affects pre-measurement offsets, and scroll-to-top reuses the follow-suspend side effects.

## Impact

- Code: `packages/client/src/lib/chat-virtual-rows.ts` (`estimateVirtualRowSize` → content-aware), `packages/client/src/components/ChatView.tsx` (measurement anchoring + scroll-to-top button + handler). No server, protocol, or persistence-format changes.
- Behavior: scrolling up on any session converges on the first message; a scroll-to-top button appears symmetric to scroll-to-bottom. No change to rendered row output.
- Risk: the tempting-but-wrong fix is a manual `scrollTop += delta` corrector — TanStack already fires that on measurement, so a second one double-moves the view. The design forbids it and tests for a single net `scrollTop` change per upward mount. The `chat-scroll-lock` scenario suite is the regression gate.
- Dependency/sequencing: lands **after** `virtualize-chat-transcript-tanstack` (it edits that change's `estimateVirtualRowSize` and container). Reversible: revert the diff → back to static estimates (and the top-scroll drift).
- Test fixture: a synthetic transcript reproducing the size profile (a ~300 KB-image user row near the top + a 24 k-char toolResult) drives the scroll-to-top convergence test.

## Discipline Skills

- `systematic-debugging`: root cause is evidence-anchored (session pull); keep the fix tied to the measured size distribution, not intuition.
- `performance-optimization`: content-aware estimate must stay O(1) per row (no per-render re-measure); verify no added layout thrash.
- `doubt-driven-review`: measurement-anchoring `scrollTop` compensation interacts with the bottom-pin `onChange` — review that interaction before it stands.
