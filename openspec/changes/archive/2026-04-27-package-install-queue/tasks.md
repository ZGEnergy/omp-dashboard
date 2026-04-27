## 1. Queue store (TDD)

- [x] 1.1 Add `packages/client/src/lib/__tests__/package-queue.test.ts` covering: idle enqueue runs immediately; second enqueue while running becomes `queued`; completion advances FIFO; duplicate enqueue is no-op; 409 response retries once after ≥500 ms; second 409 surfaces `error` and advances; success auto-clears after 3 s; error stays sticky until next enqueue of same source; `subscribe` notifies on every transition; `__resetForTests` clears state.
- [x] 1.2 Implement `packages/client/src/lib/package-queue.ts` exporting a singleton with `enqueue({ source, action, scope, cwd })`, `getStateForSource(source)`, `getRunning()`, `getQueueDepth()`, `subscribe(cb)`, internal `handleWsMessage(msg)`, and `__resetForTests()`.
- [x] 1.3 Wire the singleton's WS message handler to `window`'s `pi-package-event` `CustomEvent` listener (attached once at module load).
- [x] 1.4 Add a 409-detection branch in the queue's POST helper (`fetch` + parse `body.error`/HTTP status) that re-prepends the source and schedules one retry; second 409 emits an `error` transition.
- [x] 1.5 Verify all tests pass: `npm test -- package-queue` and capture in `/tmp/pi-test.log`.

## 2. Hook refactor

- [x] 2.1 Update `packages/client/src/hooks/usePackageOperations.ts` to be a thin subscriber over `package-queue`: keep signature `(scope, cwd, onComplete)`, derive `operation` from `getRunning()`, expose `install/remove/update` that call `enqueue`, add `statusFor(source)`, route `onComplete` through a queue subscription.
- [x] 2.2 Remove the per-hook `pi-package-event` window listener (now owned by the store) and the local `opIdRef`.
- [x] 2.3 Update / add tests for the hook to drive the store and assert derived state per source.

## 3. RecommendedExtensions UI

- [x] 3.1 Replace the `isBusy = ops.operation.status === "running" && ops.operation.source === entry.source` check with `ops.statusFor(entry.source)`-based logic. Render spinner when `running`, render new "Queued" pill when `queued`, render error message when `error`.
- [x] 3.2 Add an "Install all missing" button in the header. Disabled when no `!activeInPi` entries OR when every missing entry is already `queued`/`running`. Tooltip shows count.
- [x] 3.3 On click, iterate `recommended.filter(e => !e.activeInPi)` in manifest order and `ops.install(e.source, e.installed.scope ?? scope)` each.
- [x] 3.4 Add component test verifying: button disabled when nothing missing; clicking enqueues N items; button disables while batch in flight; per-entry scope respected.

## 4. PackageBrowser banner

- [x] 4.1 Update the status banner to read `getRunning()` source plus `getQueueDepth()`. Format: `"Installing <source>…"` plus `" (N queued)"` when N > 0.
- [x] 4.2 Keep the existing 3-second success / sticky error visual treatment unchanged.
- [x] 4.3 Add component test for the three banner states (idle, single-running, running+queued).

## 5. Cross-component integration test

- [x] 5.1 Render two consumers of `usePackageOperations` together in a test harness. Click Install on entry A in Recommended, then on package B in Browser. Assert: A spinner stays; B shows queued; dispatching A's `package_operation_complete` event causes A to clear and B's POST to fire.
- [x] 5.2 Assert that an unmount of `PackageBrowser` after its op is queued does not orphan the op — completion still arrives and `useInstalledPackages` refreshes.

## 6. Docs & validation

- [x] 6.1 Add `package-queue.ts` line to AGENTS.md "Key Files" table with one-line summary.
- [x] 6.2 Run `openspec validate package-install-queue --strict` and fix any issues.
- [x] 6.3 Full test suite: `npm test 2>&1 | tee /tmp/pi-test.log` then `grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log` — must be clean.
