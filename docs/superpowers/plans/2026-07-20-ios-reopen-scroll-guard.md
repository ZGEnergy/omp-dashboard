# iOS Reopen Scroll Correction Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop iOS inertial transcript scrolling from hard-stopping during active mobile history reading after session reopen. Suppress only TanStack Virtual's nonessential size-correction scroll. Preserve row measurement, explicit navigation, latest following, and older-anchor restoration.

**Architecture:** `ChatViewInner` owns scroll authority through `scrollOwnerRef` and `authorityRef`. `useVirtualizer({...})` returns `virtualizer`; set `virtualizer.shouldAdjustScrollPositionOnItemSizeChange` after the hook call. Callback reads current refs. Callback returns `false` only when `authorityRef.current.mobileActive` and `scrollOwnerRef.current === "READING_HISTORY"`. Callback returns `true` for every other state. `resizeItem` still measures rows and updates geometry. Existing `onChange` latest-follow behavior stays unchanged.

**Tech Stack:** React, TypeScript, TanStack Virtual 3.13.12, Vitest, Testing Library, iOS Safari Remote Web Inspector.

## Global Constraints

- Use source state as guard boundary. Read `authorityRef.current.mobileActive` and `scrollOwnerRef.current`.
- Do not add user-agent detection, iOS branches, gesture flags, or new scroll owners.
- Require current physical iOS trace correlation before merging production guard.
- Correlation requires correction write or row geometry change at fling stop. No correlation means no production guard ship.
- Run current iOS Safari tab and installed-PWA matrix. Record separate results.
- Keep `virtualizer.resizeItem`, `measureElement`, `getTotalSize()`, and image-row measurement active.
- Keep `onChange` mobile `NAVIGATING_BOTTOM` latest-follow behavior unchanged.
- Keep normal correction behavior for desktop, inactive mobile detail, `FOLLOWING`, `NAVIGATING_BOTTOM`, `NAVIGATING_TOP`, `HYDRATING`, and `RESTORING_ANCHOR`.
- Keep explicit `scrollToBottom`, `scrollToTop`, `scrollToTurn`, and older-anchor restoration writes unchanged.
- Keep `scheduleProgrammaticWrite` and `ensureScrollFrame` authority gates unchanged.
- Keep `overflowAnchor: "none"` unchanged.
- Do not change replay, row estimates, row rendering, image loading, `MobileShell`, panel transforms, or `h-[100dvh]`.
- Do not add post-settle reconciliation unless physical trace proves skipped correction leaves a wrong settled anchor. Add no reconciliation loop or per-measure write.
- Write failing behavior tests before production code.
- Change only listed files during implementation. No fallback layout changes.

## File Structure

- `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`: capture size-correction policy and prove state-specific behavior.
- `packages/client/src/components/ChatView.tsx`: assign smallest ref-backed virtualizer policy on returned instance.
- `packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx`: regression coverage only; change only when a meaningful assertion needs extension.
- `packages/client/src/App.tsx`: inspect only. Change only if callback freshness requires a prop/ref adjustment.
- `packages/client/src/components/MobileShell.tsx`: inspect only. Keep unchanged.
- `docs/superpowers/specs/2026-07-20-ios-reopen-scroll-design.md`: approved design. Keep instance-property wording aligned.

## Interfaces

- Virtualizer instance property: `shouldAdjustScrollPositionOnItemSizeChange(item, delta, instance) => boolean`.
- `item`: TanStack `VirtualItem` for row whose measured size changed.
- `delta`: measured size minus prior row size.
- `ChatViewInner` callback reads refs at invocation time. Callback does not mutate `scrollOwnerRef`.
- `false`: decline internal size-correction scroll for active mobile history reading.
- `true`: retain TanStack's normal correction scroll for every other state.

---

## Task 1: Extend virtualizer probe

**Files:**

- Modify: `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`

**Symbols:**

- `virtualizerProbe`
- mocked `useVirtualizer`

- [ ] **Step 1: Capture returned instance in existing hoisted probe**

Change the current probe from:

```ts
const virtualizerProbe = vi.hoisted(() => ({
  onChange: undefined as unknown,
}));
```

to:

```ts
const virtualizerProbe = vi.hoisted(() => ({
  onChange: undefined as unknown,
  instance: undefined as unknown,
}));
```

Capture `onChange` from options and the returned virtualizer instance in existing mock:

```ts
useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
  const instance = actual.useVirtualizer(options);
  virtualizerProbe.onChange = options.onChange;
  virtualizerProbe.instance = instance;
  return instance;
},
```

Add a test-only invocation helper beside existing scroll helpers:

```ts
type SizeCorrectionPolicy = (item: never, delta: number) => boolean;

function invokeSizeCorrectionPolicy(delta = 24): boolean {
  const instance = virtualizerProbe.instance as {
    shouldAdjustScrollPositionOnItemSizeChange?: unknown;
  } | undefined;
  expect(instance).toBeDefined();
  const policy = instance?.shouldAdjustScrollPositionOnItemSizeChange;
  expect(policy).toBeTypeOf("function");
  return (policy as SizeCorrectionPolicy)(undefined as never, delta);
}
```

Do not replace `virtualizerProbe.onChange`; existing activation and navigation tests still use it.

- [ ] **Step 2: Inspect helper shape**

Run no test command in this step. Confirm helper captures one returned virtualizer instance from every `ChatView` render and invokes its callback with positive size delta. Expected result: test file contains both probes; no source file changes.

## Task 2: Write failing behavior tests

**Files:**

- Modify: `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`

**Symbols:**

- `describe("ChatView mobile scroll owner", ...)`
- new size-correction tests
- existing activation, `FOLLOWING`, `NAVIGATING_BOTTOM`, top-navigation, touch-escape, and older-anchor tests

- [ ] **Step 1: Add active history-reading RED test**

Add this test inside `describe("ChatView mobile scroll owner", ...)`:

```tsx
it("declines internal size correction while active mobile detail reads history", async () => {
  const { container } = render(
    <ThemeProvider>
      <ChatView
        sessionId="size-correction-history"
        state={stateWith(50)}
        toolContext={defaultToolContext}
        mobileActive
        mobileActivationEpoch={1}
        replayGeneration={1}
      />
    </ThemeProvider>,
  );
  await flushRaf();

  const scrollEl = getScrollContainer(container);
  expect(invokeSizeCorrectionPolicy()).toBe(true);

  // Same callback must read current refs after render-time FOLLOWING becomes
  // user-owned READING_HISTORY. This catches stale callback closures.
  fireEvent.touchStart(scrollEl, { touches: [{ clientY: 220 }] });

  expect(invokeSizeCorrectionPolicy()).toBe(false);
});
```

Expected RED name: `ChatView mobile scroll owner > declines internal size correction while active mobile detail reads history`.

- [ ] **Step 2: Add desktop, inactive, and FOLLOWING preservation RED test**

Add one case per state. Keep each render explicit so each state owns a fresh `ChatView` and fresh probe:

```tsx
it.each([
  ["desktop", undefined, undefined],
  ["inactive mobile detail", false, undefined],
  ["active mobile FOLLOWING", true, undefined],
] as const)("keeps size correction enabled for %s", async (_label, mobileActive) => {
  const { unmount } = render(
    <ThemeProvider>
      <ChatView
        sessionId={`size-correction-${_label}`}
        state={stateWith(20)}
        toolContext={defaultToolContext}
        mobileActive={mobileActive}
        mobileActivationEpoch={1}
        replayGeneration={1}
      />
    </ThemeProvider>,
  );
  await flushRaf();
  expect(invokeSizeCorrectionPolicy()).toBe(true);
  unmount();
});
```

Expected RED names: each `keeps size correction enabled for ...` case fails because the instance property remains unset. Preserve existing test setup if Vitest reports parameter typing differences; keep three observable cases.

- [ ] **Step 3: Add explicit `NAVIGATING_BOTTOM` preservation RED test**

```tsx
it("keeps size correction enabled during explicit mobile bottom navigation", async () => {
  const { container } = render(
    <ThemeProvider>
      <ChatView
        sessionId="size-correction-bottom"
        state={stateWith(50)}
        toolContext={defaultToolContext}
        mobileActive
        mobileActivationEpoch={1}
        replayGeneration={1}
      />
    </ThemeProvider>,
  );
  await flushRaf();

  const scrollEl = getScrollContainer(container);
  setScrollPosition(scrollEl, 0, 2_000, 400);
  fireEvent.wheel(scrollEl, { deltaY: -100 });
  fireEvent.scroll(scrollEl);
  fireEvent.click(container.querySelector('[data-testid="scroll-to-bottom"]')!);

  expect(invokeSizeCorrectionPolicy()).toBe(true);
});
```

Expected RED name: `ChatView mobile scroll owner > keeps size correction enabled during explicit mobile bottom navigation`.

- [ ] **Step 4: Run RED test and record named failures**

Run:

```sh
npm test -- packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx -t "size correction"
```

Expected output: three preservation cases receive `undefined` instead of `true`; active-history case receives `undefined` instead of `false`. Existing scroll-race tests remain unchanged and are not part of this focused filter. Do not edit production code during RED phase.

## Task 3: Implement smallest ref-backed ChatView policy

**Files:**

- Modify: `packages/client/src/components/ChatView.tsx`

**Symbols:**

- `ChatViewInner`
- `authorityRef`
- `scrollOwnerRef`
- existing `useVirtualizer` call near `rangeExtractor` and `onChange`

**Precondition:** Current physical iOS trace correlates fling stop with TanStack correction write or row geometry change. If correlation fails, stop guard implementation, revert Task 1 and Task 2 code, leave `ChatView.tsx` unchanged, and record alternate cause. Do not ship a speculative production guard.

- [ ] **Step 1: Assign policy on returned virtualizer instance**

After the existing `useVirtualizer({...})` call, assign the returned instance property:

```tsx
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () =>
    !(authorityRef.current.mobileActive && scrollOwnerRef.current === "READING_HISTORY");
```
Keep existing `onChange` body unchanged:

```tsx
    onChange: () => {
      if (typeof window === "undefined" || isSelectingRef.current || mobileInactive) return;
      const element = scrollRef.current;
      if (element === null || element.isConnected === false) return;
      const follow = mobileActive
        ? scrollOwnerRef.current === "NAVIGATING_BOTTOM"
        : stickToBottomRef.current;
      if (follow) {
        scheduleProgrammaticWrite((target) => { target.scrollTop = target.scrollHeight; });
      }
    },
```

`authorityRef.current` already updates from current `mobileActive` before `useVirtualizer` creation. `scrollOwnerRef.current` already changes synchronously in `enterReadingHistory`, `scrollToBottom`, top navigation, and anchor restoration. Do not add a second mobile ref unless TypeScript or runtime inspection proves existing ref ordering insufficient.

- [ ] **Step 2: Preserve measurement and write paths**

Do not edit `requestRowMeasure`, `virtualizer.resizeItem`, `measureElement`, `ensureScrollFrame`, `scheduleProgrammaticWrite`, `pinLatest`, `enterReadingHistory`, or explicit navigation. Callback only chooses TanStack correction policy. `resizeItem` still executes after image decode.

## Task 4: Run focused component tests

**Files:**

- Test: `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`

- [ ] **Step 1: Run new and existing scroll-race coverage**

Run:

```sh
npm test -- packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx
```

Expected output: PASS. New tests prove `false` only after active mobile touch/wheel history entry. Desktop, inactive mobile, active `FOLLOWING`, and explicit `NAVIGATING_BOTTOM` return `true`. Existing activation latest, top navigation, touch escape, wheel burst, and older-anchor tests stay green.

- [ ] **Step 2: Run focused test again after any type correction**

Run the same command. Expected output: same PASS with no callback type errors and no unhandled rAF errors.

## Task 5: Run related measurement regression tests

**Files:**

- Test: `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`
- Test: `packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx`

- [ ] **Step 1: Run both affected suites**

Run:

```sh
npm test -- packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx
```

Expected output: PASS. Scroll-race state-machine coverage and image-row re-measure/coalescing coverage remain green. No `MobileShell` or `100dvh` snapshot changes appear.

- [ ] **Step 2: Inspect source diff**

Run:

```sh
git diff -- packages/client/src/components/ChatView.tsx packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx
```

Expected output: one virtualizer policy callback, probe capture, focused behavior tests, and no unrelated measurement or layout edits.

## Task 6: Validate current physical iOS Safari trace

**Files:**

- Runtime: `packages/client/src/components/ChatView.tsx`
- Device matrix: current iOS Safari tab and installed PWA
- Trace record: issue #54 evidence linked by approved design spec

- [ ] **Step 1: Reopen same session in Safari tab**

Open session with several turns. Leave session. Reopen same session. Wait for replay rows. Fling upward and downward across multiple turn boundaries. Repeat after image rows decode.

- [ ] **Step 2: Repeat in installed PWA**

Use same session, replay timing, fling direction, and row/image boundaries. Record PWA result separately from Safari tab.

- [ ] **Step 3: Capture Remote Web Inspector fields**

Record timestamped values for:

```text
scrollTop
scrollHeight
clientHeight
visualViewport.height
touch, pointer, and scroll events
ResizeObserver callbacks and changed row geometry
TanStack correction scrollTo calls
ChatView direct scrollTop writes and explicit scrollTo calls
```

Expected pass evidence: active mobile `READING_HISTORY` fling continues through row/image measurement; trace shows no nonessential TanStack correction write moving viewport during fling; explicit bottom/top/turn and older-anchor navigation still moves viewport.

- [ ] **Step 4: Enforce trace gate**

Merge guard only when correction write or correlated geometry change overlaps hard-stop timestamp. If trace shows hard stop without that correlation, remove production guard and guard-specific tests, keep approved non-goals unchanged, and record alternate cause. Do not add layout fallback or reconciliation from an uncorrelated trace.

- [ ] **Step 5: Add reconciliation only with proof**

Do not add reconciliation for normal pass. Add one coalesced post-settle write only when trace proves skipped correction leaves wrong settled anchor. Guard write by current authority, current session, active mobile detail, and `READING_HISTORY`; block during touch/pointer movement, explicit navigation, and anchor restoration. Add a failing test before any such write.

## Task 7: Run CodeRabbit and quality review

**Files:**

- Review: all changed implementation and test files

- [ ] **Step 1: Run CodeRabbit review**

Run:

```sh
npx tsx .pi/skills/implement/scripts/review-changes.ts
```

Expected output: advisory review warns and continues. Fix Critical and Warning findings before commit. Keep informational findings as review notes.

- [ ] **Step 2: Run repository quality oracle**

Run:

```sh
npm run quality:changed
```

Expected output: Biome changed-file check, TypeScript no-emit check, and related test command exit 0 with no warnings treated as errors.

- [ ] **Step 3: Re-read changed paths**

Confirm only intended callback, probe, and behavior assertions changed. Confirm `MobileShell.tsx`, `App.tsx`, row measurement, replay, and layout files remain unchanged.

## Task 8: Commit implementation

**Files:**

- Commit only approved implementation and test files after trace and quality gates pass.

- [ ] **Step 1: Check whitespace and staged paths**

Run:

```sh
git diff --check
git status --short
```

Expected output: no whitespace errors; staged paths contain only approved source/test files. Documentation plan and design spec remain unchanged during implementation branch commit unless separately requested.

- [ ] **Step 2: Commit**

Run:

```sh
git add packages/client/src/components/ChatView.tsx packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx packages/client/src/components/__tests__/ChatView.image-row-measure.test.tsx
git commit -m "fix(client): guard iOS history scroll correction"
```

Expected output: commit succeeds after pre-commit checks. Commit contains source-state guard, TDD coverage, and no fallback layout changes.

## Completion Checklist

- [ ] Active mobile detail plus `READING_HISTORY` returns `false` from size-correction policy.
- [ ] Desktop, inactive mobile detail, `FOLLOWING`, and `NAVIGATING_BOTTOM` return `true`.
- [ ] Activation latest, explicit navigation, historical paging, older-anchor restoration, and image-row measurement tests pass.
- [ ] Safari tab and installed-PWA traces correlate hard stop with correction or geometry behavior.
- [ ] No correlation blocks production guard merge.
- [ ] No `MobileShell`, `100dvh`, user-agent, replay, row-estimate, or measurement fallback change lands.
- [ ] CodeRabbit and `npm run quality:changed` pass.
- [ ] Commit contains only approved implementation and tests.
