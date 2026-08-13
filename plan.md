# Implementation Plan - Fix ctx.ui re-patching stack overflow & self-cancellation (#115)

## Objective
Fix issue #115 where `ctx.ui` prompt method patching runs on every `session_start` without idempotence. Subsequent runs capture previously patched wrapper methods as "originals", creating a deeply nested adapter wrapper chain equal in depth to the number of `session_start` invocations. When a prompt is presented, the chain recurses through prior `PromptBus` instances until a `RangeError: Maximum call stack size exceeded` occurs, which is caught and silently converted into a user `Cancelled` response.

The fix makes original method capture idempotent per `ctx.ui` object identity using a `WeakMap` cache, attaches wrapper tags to patched methods, stops converting adapter errors to user cancellations in the TUI adapter, and logs adapter errors in `PromptBus`.

---

## Files to Modify

1. `packages/extension/src/prompt-bus.ts`
   - Add `error?: string` to `PromptResponse` interface.
   - Log adapter exceptions in `PromptBus.request()` instead of silently swallowing them.

2. `packages/extension/src/bridge.ts`
   - Import `getOrCreatePristineOriginals` from `./ctx-ui-originals.js`.
   - Replace direct line ~2195 `originals` object creation in `session_start` with `getOrCreatePristineOriginals(ctx.ui)`.
   - Attach `__isPromptBusWrapper = true` to all patched wrapper functions on `ctx.ui`.
   - Update TUI adapter `catch` block (line ~2342) to respond with `{ id: prompt.id, cancelled: false, error: String(err), source: "tui" }` instead of `cancelled: true`.

3. `packages/extension/src/__tests__/tui-prompt-adapter.test.ts`
   - Update adapter error test cases if necessary to align with non-cancelling error response shape.

---

## Files to Create

1. `packages/extension/src/ctx-ui-originals.ts`
   - Export `PristineUiOriginals` interface.
   - Maintain a module-level `WeakMap<object, PristineUiOriginals>` keyed by `ctx.ui`.
   - Export `getOrCreatePristineOriginals(ui: any): PristineUiOriginals` which captures native `select`, `input`, `confirm`, `editor`, and `notify` bindings on first call and reuses stored pristine bindings on subsequent calls. Includes dev warning if initial capture detects `__isPromptBusWrapper`.

2. `packages/extension/src/__tests__/ctx-ui-session-start-repatch-regression.test.ts`
   - Unit tests covering:
     a) Original function reference identity across multiple `session_start` / patch cycles on the same `ctx.ui`.
     b) Prevention of recursion / `RangeError` when `ctx.ui.select` is invoked after 10+ re-patch runs.
     c) Verification that a throwing adapter responds with `cancelled: false` and `error` message rather than `cancelled: true`.

---

## Implementation Steps

### Step 1: Create Pristine Originals Cache (`ctx-ui-originals.ts`)
- Create `packages/extension/src/ctx-ui-originals.ts`.
- Implement `PristineUiOriginals` interface holding pristine references for `notify`, `select`, `input`, `confirm`, `editor`.
- Define `const pristineUiMap = new WeakMap<object, PristineUiOriginals>()`.
- Export `getOrCreatePristineOriginals(ui: any)`:
  - If `ui` is present in `pristineUiMap`, return the cached pristine originals object.
  - Otherwise, capture `.bind(ui)` references for native methods, store in `pristineUiMap`, and return.

### Step 2: Update `PromptBus` Error Support (`prompt-bus.ts`)
- Add `error?: string` to `PromptResponse` in `packages/extension/src/prompt-bus.ts`.
- Update `request()` method's adapter dispatch loop (lines ~163-172):
  - In `catch (err)` block, log `console.error('[PromptBus] Adapter "${adapter.name}" threw during onRequest:', err)`.

### Step 3: Wire Idempotent Capture & Non-Cancelling Error Handling (`bridge.ts`)
- Import `getOrCreatePristineOriginals` in `packages/extension/src/bridge.ts`.
- Replace inline `originals` creation in `session_start` (lines 2194-2200) with `getOrCreatePristineOriginals(ctx.ui)`.
- Mark each generated wrapper function (lines 2399-2570) with `wrapperFn.__isPromptBusWrapper = true`.
- In TUI adapter `onRequest` -> `present()` (lines 2342-2346):
  - Change `catch` block to:
    ```ts
    } catch (err) {
      if (!ac.signal.aborted) {
        bus.respond({
          id: prompt.id,
          cancelled: false,
          error: err instanceof Error ? err.message : String(err),
          source: "tui",
        });
      }
    }
    ```

### Step 4: Add Regression Test Suite (`ctx-ui-session-start-repatch-regression.test.ts`)
- Create `packages/extension/src/__tests__/ctx-ui-session-start-repatch-regression.test.ts`.
- Write test case (a): Assert `getOrCreatePristineOriginals(ctx.ui)` returns identical function references before and after patching `ctx.ui`.
- Write test case (b): Simulate 10 consecutive `session_start` patch cycles on a single `ctx.ui` mock. Call `ctx.ui.select(...)` and assert it completes without stack overflow or wrapper chain recursion.
- Write test case (c): Register an adapter that throws in `onRequest` / `present()`, trigger a request via `bus.request()`, and assert `response.cancelled === false` and `response.error` is defined.

### Step 5: Verify Suite & Fix Existing Tests
- Run focused Vitest suite to ensure zero regressions across all extension tests.

---

## Test Plan

Execute test runner from worktree root using isolated environment:
```bash
PATH="/home/joe/code/zge-workspace/omp-dashboard/node_modules/.bin:$PATH" \
HOME=$(mktemp -d -t pi-test-XXXXXX) \
vitest run \
  packages/extension/src/__tests__/ctx-ui-session-start-repatch-regression.test.ts \
  packages/extension/src/__tests__/prompt-bus.test.ts \
  packages/extension/src/__tests__/tui-prompt-adapter.test.ts \
  packages/extension/src/__tests__/no-tui-multiselect-arm-regression.test.ts \
  packages/extension/src/__tests__/prompt-bus-wiring.test.ts
```

Expected output:
- All test suites pass.
- `ctx-ui-session-start-repatch-regression.test.ts` passes all 3 sub-assertions.
- `no-tui-multiselect-arm-regression.test.ts` continues to pass.

---

## Acceptance Criteria

- [x] Re-patching `session_start` does not nest wrappers or grow call stack depth across multiple sessions.
- [x] Pristine originals are captured once per `ctx.ui` object identity via `WeakMap`.
- [x] Adapter exceptions log error details and respond with `cancelled: false` and `error` string rather than user `Cancelled`.
- [x] Regression test covers pristine function identity, multi-session non-recursion, and non-cancelled error reporting.
