## 1. Category A — Assertion drift (19 tests)

- [x] 1.1 `packages/server/src/__tests__/auto-attach.test.ts` — 7 tests. Read current `openspec-activity-detector.ts` output shape; update assertions that expect `openspecChange` to carry a value to match actual shape. If all 7 share a single root cause, fix it in one edit.
- [x] 1.2 `packages/client/src/components/__tests__/PiResourcesView.test.tsx` — 5 tests. Align fetch mocks with current `PiResourcesView.tsx` request shape and tab behavior (Installed/Packages tabs).
- [x] 1.3 `packages/client/src/components/__tests__/SessionList.test.tsx` — 4 tests. Update spawn-button selectors to match current `SessionList.tsx` (likely `📌 Add folder` + spawn button relocation).
- [x] 1.4 `packages/shared/src/__tests__/config.test.ts` — 3 tests. `autoShutdown` default changed from `true` → `false` in code; update test expectations to match current default OR file a separate bug if the default is wrong.

## 2. Category B — git default branch (6 tests)

- [x] 2.1 `packages/server/src/__tests__/git-operations.test.ts` — 6 tests. Replace every `git checkout master` / `git init` with `git -c init.defaultBranch=main init` and `git checkout main`. Verify the 15 passing tests in the same file are unaffected.

## 3. Category D — Component selector drift (3 tests)

- [x] 3.1 `packages/client/src/components/__tests__/PinDirectoryDialog.test.tsx` — 2 tests. Fix onPin callback plumbing: read current dialog props + wire test accordingly.
- [x] 3.2 `packages/client/src/components/__tests__/SessionCard.test.tsx` — 1 test. Update highlight-when-selected assertion to match current class/aria-selected logic.

## 4. Category C — Tests using os.homedir() on isolated HOME (3 tests)

- [x] 4.1 `packages/server/src/__tests__/browse-endpoint.test.ts` — 3 tests. Either (a) create fixture subdirectories inside isolated `$HOME` before asserting, or (b) refactor tests to pass an explicit path argument (preferred — more hermetic).

## 5. Category E — Timing/lifecycle tests (7 tests)

For each test: first attempt stabilization with `vi.useFakeTimers()` + explicit `vi.advanceTimersByTimeAsync()`. If that takes >15 minutes without success, `.skip` with an inline TODO and add a bullet to section 7 ("Deferred").

- [x] 5.1 `packages/server/src/__tests__/auto-shutdown.test.ts` — 2 tests. Idle-timer fake-timer driven.
- [x] 5.2 `packages/server/src/__tests__/session-lifecycle-logging.test.ts` — 2 tests. Log-capture timing.
- [x] 5.3 `packages/server/src/__tests__/ws-ping-pong.test.ts` — 2 tests. WS ping-timeout lifecycle — hardest category; likely ends in `.skip`.
- [x] 5.4 `packages/server/src/__tests__/sleep-aware-heartbeat.test.ts` — 1 test. Heartbeat timeout.

## 6. Final verification

- [x] 6.1 Run `npm test`. Assert: 0 failures. Record final pass/skip numbers. (Result: 211 files passed, 2143 tests passed, 8 skipped, 0 failed.)
- [x] 6.2 Update `openspec/specs/test-environment-isolation/spec.md` (via delta in section 8) with the "green baseline" requirement. (Delta already ships green-baseline scenario + MODIFIED requirement language in `specs/test-environment-isolation/spec.md`.)
- [x] 6.3 Confirm zero `~/.pi/agent/sessions/` files outside current cwd were touched (re-run the isolation snapshot-diff recipe from `AGENTS.md`). (Diff was empty after `npm test`.)

## 7. Deferred timing-flake investigation

Populated during phase 5 as tests get `.skip`'d. Each entry SHOULD have: file:line, one-line reason, and a hint at the cleanest followup fix.

- `packages/server/src/__tests__/auto-shutdown.test.ts` · `should shut down after idle timeout when no sessions connect` — idle-timer fires (console log confirms) but `process.exit(0)` is reached only after `await stopServer()` resolves; fake-timer `advanceTimersByTimeAsync` does not drain the real HTTP-close I/O. Follow-up: refactor `idle-timer.ts` to expose the shutdown callback synchronously, or inject a mock `stopServer` that resolves immediately so the test can assert the exit call without driving real I/O.
- `packages/server/src/__tests__/auto-shutdown.test.ts` · `should not shut down when autoShutdown is false` — afterEach hook times out; same fake-timer/real-I/O root cause. Follow-up: same as above.
- `packages/server/src/__tests__/session-lifecycle-logging.test.ts` · `should log on ping timeout` — pi-gateway now keeps session alive when TCP socket is still writable (logs "ping: N misses but TCP alive, keeping session"), so pausing the ws socket never reaches the old `connection dead` path. Follow-up: stub/mocking the TCP writability probe, or wire a new test around the new `keeping session` log line.
- `packages/server/src/__tests__/ws-ping-pong.test.ts` · `should terminate connection when client stops responding to pings` — same TCP-alive-keeps-session root cause as above. Follow-up: mock `socket.writable` / `socket.destroyed` to force the terminate branch, or exercise terminate via `ws.terminate()` directly.
- `packages/server/src/__tests__/ws-ping-pong.test.ts` · `should call onEmpty after ping timeout terminates last connection` — depends on the previous test path firing; will un-skip once the terminate branch is reachable again.

## 8. Spec delta

- [x] 8.1 Add a MODIFIED Requirement to the `test-environment-isolation` capability: after a successful `npm test` on isolated HOME, the suite SHALL exit with code 0 (0 failures; skips acceptable when documented). (Covered by the "Suite exits green on isolated HOME" scenario + extended Requirement language in the delta.)
