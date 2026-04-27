## Context

`ChatView.tsx` already has a `programmaticScroll` ref, introduced for `scrollToTurn` (programmatic jump to a specific turn). The ref guards the auto-scroll-on-new-content `useEffect` from firing during a programmatic jump — but the `handleScroll` callback unconditionally writes `isNearBottom.current` and `setShowScrollButton`. That gap is the bug.

The race window only opens when content grows in between a `scrollTo()` call and the corresponding `onScroll` event firing — which is exactly what happens during multi-batch `event_replay`.

## Decision

Reuse `programmaticScroll` as the single guard for *both* the auto-scroll effect and `handleScroll`. Set the flag whenever ChatView itself initiates a scroll, clear it on a short timeout (150 ms — same magnitude as the existing `scrollToTurn` 200 ms clear), and have `handleScroll` early-return while the flag is set.

```
            ┌──────────────────────────────────────────────┐
            │              scroll-to-bottom call            │
            │  (session switch · new content · scrollToTurn)│
            └───────────────────┬──────────────────────────┘
                                │
                                ▼
                  programmaticScroll.current = true
                                │
                                ▼
                       el.scrollTo(...)
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                    ▼
     auto-scroll effect                      handleScroll
     fires for new content                   fires (eventually)
              │                                    │
              │ if programmaticScroll → skip       │ if programmaticScroll → return
              ▼                                    ▼
     no nested scroll                       isNearBottom unchanged ✓
                                │
                                ▼
                    setTimeout(150ms) clears flag
                                │
                                ▼
                   real user scrolls now flow through
```

## Why 150 ms

Browser-emitted `onScroll` for a single `scrollTo({behavior: "instant"})` fires within one frame (≤16 ms). 150 ms generously covers paint-stutter and any extra coalesced events. The existing `scrollToTurn` uses 200 ms, which we leave alone.

If a real user scrolls within 150 ms of a programmatic auto-scroll, their scroll is dropped — but auto-scroll already overrides any user scroll while `isNearBottom` is true, so the user-visible behavior is unchanged.

## Alternatives considered

- **Per-call ignore-once flag**: simpler in spirit, but `scrollTo` can produce multiple `onScroll` events, and we'd need to count them. The time-window approach is dumber and more robust.
- **`ResizeObserver` chase**: more general — would also fix async height growth from markdown / image decode. Larger surface area; defer until we observe that bug. Tracked as out-of-scope in the proposal.
- **Server-side "replay complete" signal**: would let us defer the initial restore until the tail arrives. Requires protocol changes in `browser-protocol.ts` plus subscription-handler bookkeeping. Heavier; skipped.

## Test strategy

Given the bug is a DOM-level race, vitest + jsdom can simulate the failing handleScroll measurement directly:

1. Render `ChatView` with empty state, then update messages prop in two ticks to mimic two replay batches.
2. After each batch, manually invoke `handleScroll` with a synthetic event whose `scrollHeight` exceeds `scrollTop + clientHeight` by more than `SCROLL_THRESHOLD`.
3. Assert `isNearBottom.current` remains `true` (because `programmaticScroll` is set).

A second test asserts that once the suppression window elapses, a real scroll-up flips `isNearBottom.current` to `false`.

## Risks

- **Timer leakage on unmount**: clear the suppression timeout in the `useEffect` cleanup to avoid setting `programmaticScroll.current` on a stale ref.
- **`scrollToTurn` regression**: it already manages its own flag with a 200 ms timeout. Adding the early-return to `handleScroll` only strengthens the existing pattern; no behavior change there.
