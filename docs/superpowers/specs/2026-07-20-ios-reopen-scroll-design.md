# omp-dashboard: iOS session-reopen scroll correction guard

**Date:** 2026-07-20
**Status:** Design — awaiting implementation
**Issue:** https://github.com/ZGEnergy/omp-dashboard/issues/54
**Scope:** `packages/client/` scroll ownership and virtualizer configuration

## Problem

Current iOS Safari can stop inertial transcript scrolling when a reopened session replays history.

Replay creates virtual transcript rows with estimates first. `ChatViewInner` mounts rows through TanStack Virtual `measureElement`. Images also call `requestRowMeasure`, which calls `virtualizer.resizeItem` after decode. TanStack Virtual can correct an above-viewport size change with an internal `scrollTo`.

At turn boundaries, this correction can interrupt a fling while the user reads history. The visible symptom: iOS stops or jumps during a multi-turn swipe after session reopen.

## Reproduction

1. Open session with several turns on current iOS Safari.
2. Leave session. Reopen same session.
3. Wait for replay-created rows to appear.
4. Fling upward or downward across several turns.
5. Repeat in Safari tab and installed PWA.
6. Record scroll position during each turn boundary and each row/image measurement.

Capture remote-inspector data for every run:

- `scrollTop`, `scrollHeight`, `clientHeight`.
- Touch, pointer, and scroll events with timestamps.
- Every programmatic scroll write, including `scrollTo` and direct `scrollTop` writes.
- `ResizeObserver` callbacks and changed row geometry.
- `visualViewport.height`.

## Evidence and hypothesis

### Source-grounded evidence

- `ChatViewInner` owns `scrollOwnerRef`, `mobileActive`, replay generations, activation epochs, and guarded application scroll writes.
- `virtualizer` uses `estimateSize`, `measureElement`, `resizeItem`, and `onChange`.
- `scrollOwnerRef.current === "READING_HISTORY"` records active mobile history reading.
- `onChange` only issues a latest-follow write for mobile `NAVIGATING_BOTTOM`; it does not intentionally follow `READING_HISTORY`.
- `enterReadingHistory` cancels queued writes before setting `READING_HISTORY`.
- `scrollToBottom`, `scrollToTop`, `scrollToTurn`, and older-anchor restoration issue explicit navigation writes.
- `App` passes `mobileActive={isMobile && mobileDetailVisible}`, `mobileActivationEpoch`, and `replayGeneration` into `ChatView`.
- `MobileShell` keeps both panels mounted, slides them with `transform`, and uses `h-[100dvh]`.
- Existing scroll-race tests cover mobile activation, `FOLLOWING`, bottom navigation, top navigation, touch escape, older-anchor restoration, and image-row measurement.

### Device hypothesis

The issue report links a stop to replay-created estimated rows and iOS Safari inertial scrolling. No remote-inspector trace in this repository proves correlation yet. Treat internal TanStack correction as the cause only when a correction write or geometry change lines up with a fling stop.

Sources:

- Issue: https://github.com/ZGEnergy/omp-dashboard/issues/54
- Research: https://github.com/ZGEnergy/omp-dashboard/issues/54#issuecomment-5029858580
- Proposal: https://github.com/ZGEnergy/omp-dashboard/issues/54#issuecomment-5029902274
- Refinement: https://github.com/ZGEnergy/omp-dashboard/issues/54#issuecomment-5029904962
- TanStack Virtual: 3.13.12

## Scope

- Add a virtualizer size-correction policy in `ChatViewInner`.
- While `mobileActive` and `scrollOwnerRef.current === "READING_HISTORY"`, decline nonessential TanStack size-correction scrolling.
- Keep existing guarded writes, owner transitions, activation behavior, explicit navigation, and image-row measurement.
- Reconcile at most once after scroll settles only if device trace proves reconciliation necessary.

## Non-goals

- No `MobileShell` transform change.
- No `100dvh` change.
- No new scroll owner.
- No change to replay, row estimates, row rendering, or image loading.
- No change to `FOLLOWING`, `NAVIGATING_BOTTOM`, `NAVIGATING_TOP`, `HYDRATING`, or `RESTORING_ANCHOR` semantics.
- No suppression of explicit `scrollToBottom`, `scrollToTop`, `scrollToTurn`, or older-anchor restoration writes.
- No reconciliation loop or per-measure scroll write.
- No iOS-only user-agent branch.

## Proposed mechanism

Set `shouldAdjustScrollPositionOnItemSizeChange` on the existing `virtualizer` instance after `useVirtualizer({...})` returns.

Policy:

- Return `false` for nonessential internal size-correction scrolling only when `mobileActive` is true and `scrollOwnerRef.current` is `"READING_HISTORY"`.
- Preserve TanStack's normal correction policy for desktop, inactive mobile, `FOLLOWING`, `NAVIGATING_BOTTOM`, `NAVIGATING_TOP`, `HYDRATING`, and `RESTORING_ANCHOR`.
- Do not block `virtualizer.resizeItem`. Rows still measure, `getTotalSize()` still updates, and later rows still reposition.
- Do not route explicit application navigation through this policy. Existing `scheduleProgrammaticWrite` and `ensureScrollFrame` authority checks remain the final gate for application writes.
- Keep `onChange` bottom-follow behavior unchanged. `NAVIGATING_BOTTOM` remains allowed to chase a growing latest tail.
- Keep `overflowAnchor: "none"`; browser anchoring and TanStack correction must not both compensate the same change.

The callback must read current refs, not stale render state, because TanStack can invoke it during measurement outside React render. `mobileActive` needs a current ref if callback dependencies cannot safely recreate the virtualizer. The policy must not mutate `scrollOwnerRef`.

## State transitions

### Reopen and activation

1. `App` raises `mobileActivationEpoch` when visible mobile detail changes and raises `replayGeneration` on replay.
2. `ChatViewInner` activation effect cancels stale writes.
3. During history load, owner becomes `HYDRATING`; no size-correction guard applies.
4. After history load, owner becomes `FOLLOWING` and `pinLatest` performs existing activation-to-latest behavior.
5. A user touch or wheel gesture calls `enterReadingHistory`; it cancels queued writes and sets owner to `READING_HISTORY`.

### Active history reading

1. User fling keeps owner `READING_HISTORY`.
2. Replay, row mount, image decode, or `resizeItem` may change row size.
3. TanStack may update row geometry but must not perform nonessential correction scrolling through the new policy.
4. Native inertial scrolling remains sole owner of viewport movement.
5. `handleScroll` keeps history controls, top paging, and near-bottom transition behavior unchanged.

### Explicit navigation

1. `scrollToBottom` sets `NAVIGATING_BOTTOM`, then uses existing scheduled `scrollTo`.
2. `onChange` may keep `NAVIGATING_BOTTOM` pinned while rows grow.
3. Near-bottom `handleScroll` changes owner to `FOLLOWING`.
4. `scrollToTop` sets `NAVIGATING_TOP`, then uses existing `scrollToIndex`.
5. Near-top `handleScroll` changes owner to `READING_HISTORY`.
6. `scrollToTurn` sets `READING_HISTORY` and uses existing explicit `scrollToIndex`; the size-correction policy must not block this call.
7. Older-page restoration sets `RESTORING_ANCHOR`, uses existing bounded anchor writes, then returns to `READING_HISTORY`.

### Optional post-settle reconciliation

Do not add reconciliation before device evidence. If trace evidence proves skipped correction leaves a wrong settled anchor, add one coalesced reconciliation after native scrolling settles. Guard it by current authority, current session, active mobile detail, and `READING_HISTORY`; allow no more than one write per settle window. Reconciliation must not run during touch/pointer movement, explicit navigation, or anchor restoration.

## Alternatives rejected

| Alternative | Reason rejected |
|---|---|
| Change `MobileShell` transform | No trace evidence links panel transform to the stop. Changes mounted-panel navigation behavior. |
| Replace `100dvh` | No trace evidence links viewport unit to the stop. Changes full-screen sizing and keyboard behavior. |
| Disable all virtualizer measurement correction | Breaks desktop anchors, historical reading, image-row geometry, and row positioning. |
| Add direct total-height delta compensation | Existing design makes TanStack the measurement-correction owner. A second compensator can double-move the viewport. |
| Force every row mounted on reopen | Removes virtualization cost and does not prevent image or late-row geometry changes. |
| User-agent or iOS-only branch | Brittle device detection. Scroll-owner state gives a behavior-based boundary. |
| Change `FOLLOWING` or bottom-pin logic | Breaks activation-to-latest and latest-tail growth behavior, which must remain intact. |
| Reconcile on every measurement | Recreates the correction storm and can interrupt the same fling. |

## Acceptance and validation matrix

| Case | Setup | Required result | Evidence |
|---|---|---|---|
| Reopen latest | Mobile Safari, same session, cold replay | Activation lands latest; owner reaches `FOLLOWING`; no stale write moves viewport | Component test plus device trace |
| History fling | Reopen, touch-fling across multiple turns while owner `READING_HISTORY` | Inertial scroll continues across row/image measurement; no nonessential correction write | Remote-inspector trace |
| Safari tab | Repeat in current iOS Safari tab | Same result as installed PWA | Device trace |
| Installed PWA | Repeat in installed PWA | Same result as Safari tab, or trace records separate platform behavior | Device trace |
| Following measurement | Active mobile latest view; virtual rows grow | Existing bottom-follow behavior stays intact | `ChatView.scroll-race.test.tsx` |
| Bottom navigation | History position, activate scroll-to-bottom | Explicit smooth/instant navigation reaches latest and remains pinned during growth | `ChatView.scroll-race.test.tsx` |
| Top navigation | Mid-list position, activate scroll-to-top | Explicit top navigation reaches top; programmatic scroll does not page older history | `ChatView.scroll-race.test.tsx` |
| Historical reading | User touch/wheel enters history; replay or measurement changes height | Owner stays `READING_HISTORY`; viewport does not follow latest | Scroll-race component test |
| Older anchor | Load older page at top | Matching completed anchor restores row and offset; unrelated height growth does not restore | `ChatView.scroll-race.test.tsx` |
| Image row | Decode one or several images in active mobile history | Row re-measures; anchor stays stable; one frame coalesces multiple image loads | `ChatView.image-row-measure.test.tsx` |
| Reconciliation gate | Trace proves skipped correction causes wrong settled anchor | At most one coalesced post-settle reconciliation; no reconciliation without evidence | New component test plus trace |
| Non-mobile layout | Desktop or inactive mobile detail | No policy change to existing correction behavior | Existing desktop tests and smoke check |

Implement guard only if the device trace correlates a correction write or geometry change with the stop. If trace shows no correlation, leave production code unchanged and record the alternate cause.

## Risks and rollback

### Risks

- Skipping internal correction can leave settled `scrollTop` visually offset if row estimates diverge above the viewport.
- A stale callback read can suppress or permit correction under the wrong owner.
- A reconciliation write can still interrupt a fling if settle detection fires early.
- Existing explicit anchor restoration can regress if policy treats it as internal correction.
- Safari tab and installed PWA can differ in viewport and inertial-scroll timing.

### Mitigations

- Read current ownership and activation authority from refs.
- Keep `resizeItem` and row measurement active.
- Preserve explicit writes outside the policy.
- Require trace correlation before adding reconciliation.
- Run existing scroll-race and image-row coverage plus device matrix.

### Rollback

Remove the size-correction policy and any evidence-gated reconciliation. Restore current TanStack Virtual options. Keep existing scroll-owner and authority code unchanged. Do not roll back `MobileShell` layout because this design does not change it.

## Exact affected files and symbols

### Production files

- `packages/client/src/components/ChatView.tsx`
  - `ChatViewInner`.
  - `ScrollOwner` and `scrollOwnerRef`.
  - `virtualizer` instance and `onChange`.
  - `mobileInactive`, `authorityRef`, `scheduleProgrammaticWrite`, and `ensureScrollFrame`.
  - `enterReadingHistory`, `handleScroll`, `pinLatest`, `scrollToBottom`, `scrollToTop`, and imperative `scrollToTurn`.
  - `requestRowMeasure` and image `onLoad` measurement path.
- `packages/client/src/App.tsx`
  - `mobileDetailVisible`, `mobileActivationEpoch`, `replayGenerationMap`.
  - `sessionDetail` and `<ChatView>` mobile activation props. Change only if trace or callback freshness requires a prop/ref adjustment.
- `packages/client/src/components/MobileShell.tsx`
  - `MobileShell` remains unchanged. `detailTransform`, `listTransform`, and `h-[100dvh]` stay out of scope unless trace evidence changes scope.

### Test files

- `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`
  - Extend mobile owner tests for size-correction suppression and preservation of activation, explicit navigation, history reading, and older-anchor behavior.
- `packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx`
  - Preserve image-row anchor and coalesced measurement coverage.

## Decision gate

Capture current iOS Safari traces first. Implement the guard only after a correction write or correlated geometry change matches a fling stop. Keep all other layout and viewport hypotheses unmodified until evidence supports them.
