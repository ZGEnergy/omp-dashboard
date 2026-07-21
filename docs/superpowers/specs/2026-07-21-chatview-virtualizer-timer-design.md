# ChatView virtualizer timer test design

**Date:** 2026-07-21  
**Status:** Approved design  
**Scope:** ChatView virtualizer timer tests

## Scope

Edit `packages/client/src/components/__tests__/ChatView.test.tsx`.

Keep TanStack Virtual debounce timer ownership.

Replace fake-timer-count assertions in two ChatView tests.

Drain 150ms timer after unmount.

Assert post-unmount safety.

Keep test-only behavior.

Change no production source.

Change no dependencies.

## Rationale

TanStack Virtual owns reset timer lifecycle.

`vi.getTimerCount()` sees unrelated timers.

Timer-count equality couples tests to library internals.

Post-unmount assertions cover observable safety.

## Test cases

### ChatView reset timer

Record pre-render timer count.

Capture virtualizer `onChange` callback.

Render `ChatView` inside `ThemeProvider` with empty state.

Clear initial `onChange` calls.

Unmount ChatView.

Drain pending timer with `act(() => vi.runOnlyPendingTimers())`.

Assert `onChange` callback does not run.

Assert timer count returns to pre-render baseline.

Assert `console.error` receives no React update error.

### Window virtualizer reset timer

Record pre-render timer count.

Capture virtualizer `onChange` callback.

Render `WindowVirtualizerProbe`.

Clear initial `onChange` calls.

Unmount probe.

Drain pending timer with `act(() => vi.runOnlyPendingTimers())`.

Assert `onChange` callback does not run.

Assert timer count returns to pre-render baseline.

Assert `console.error` receives no React update error.

## Validation

Run focused test file:

```text
npx vitest run packages/client/src/components/__tests__/ChatView.test.tsx
```

Confirm both timer tests pass.

Confirm no production source changes.

Confirm no dependency changes.
