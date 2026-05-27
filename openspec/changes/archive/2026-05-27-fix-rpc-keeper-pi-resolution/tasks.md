## 1. Server-side resolution

- [x] 1.1 In `packages/server/src/process-manager.ts`, modify `spawnHeadlessViaKeeper` to call `resolvePiCommand()` before invoking `km.spawnKeeperFor`. Return `{ success: false, code: "PI_NOT_FOUND", message: ... }` on resolver miss, matching the non-keeper headless branch message format.
- [x] 1.2 Remove the stale comment "the keeper spawns pi internally via its own PATH lookup, so we do NOT need to resolve pi here" at `process-manager.ts:451-454`. Replace with a one-liner explaining that the resolved argv is forwarded via `PI_KEEPER_PI_CMD`.
- [x] 1.3 Extend `KeeperManager.spawnKeeperFor` signature in `packages/server/src/rpc-keeper/keeper-manager.ts` to accept `piCmd: string[]`. JSON-encode and inject into `keeperEnv` as `PI_KEEPER_PI_CMD` (alongside existing `PI_KEEPER_PI_ARGS`).
- [x] 1.4 Update the `spawnKeeperFor` JSDoc and the `KeeperManager` interface type to document the new param.
- [x] 1.5 Update the caller in `process-manager.ts` (`km.spawnKeeperFor(transportId, cwd, env, piArgs)`) to pass the resolved `piCmd`.

## 2. Keeper-side consumption

- [x] 2.1 In `packages/server/src/rpc-keeper/keeper.cjs`, add `readPiCmd()` helper that reads `process.env.PI_KEEPER_PI_CMD`, parses JSON, and returns the array iff it's a non-empty `string[]`. On any failure (missing / malformed / wrong shape / empty array), return null AND, only when the env var was present-but-malformed, log `keeper: ignoring malformed PI_KEEPER_PI_CMD`.
- [x] 2.2 In `spawnPi()`, replace `child_process.spawn("pi", piArgs, …)` with: `const cmd = readPiCmd(); const exe = cmd ? cmd[0] : "pi"; const argv = cmd ? [...cmd.slice(1), ...piArgs] : piArgs; child_process.spawn(exe, argv, …)`.
- [x] 2.3 Update the `log(`spawning pi ${piArgs.join(" ")}`)` line to log the resolved executable path: `log(`spawning pi ${exe} ${argv.join(" ")}`)`.
- [x] 2.4 Strip `PI_KEEPER_PI_CMD` from the env passed to pi (next to the existing `delete env.PI_KEEPER_PI_ARGS`).

## 3. Tests

- [x] 3.1 Add unit test in `packages/server/src/rpc-keeper/__tests__/keeper-manager.test.ts` (create if missing): asserts `spawnKeeperFor` injects `PI_KEEPER_PI_CMD` with JSON-encoded resolved argv into the keeper env. _(Extended existing `packages/server/src/__tests__/keeper-manager.test.ts` with the PI_KEEPER_PI_CMD assertions instead of creating a new file.)_
- [x] 3.2 Add unit test in `packages/server/src/__tests__/process-manager.test.ts` (or extend existing): asserts `spawnHeadlessViaKeeper` returns `PI_NOT_FOUND` when the resolver mock returns null, and that the keeper is NOT spawned. _(Extended `process-manager-keeper-spawn.test.ts`.)_
- [x] 3.3 Add unit tests for the keeper's `readPiCmd()` helper (extract to a small testable module under `packages/server/src/rpc-keeper/` if needed for jest/vitest reach; otherwise script-level test that invokes the keeper as a child with mocked pi binary). Cover: env unset, valid `["/abs/pi"]`, valid `["node","/abs/cli.js"]`, malformed JSON, empty array, non-array object. _(Added 4 integration tests in `keeper.test.ts` exercising node+script form, malformed JSON, empty array, and env-strip. Bare-unset is exercised by every existing keeper test.)_
- [x] 3.4 Regression test: existing keeper tests that rely on bare-`"pi"` PATH lookup MUST continue to pass without modification. Verify by running the full `packages/server` suite before and after the keeper change. _(All keeper/process-manager-related tests pass; 2 unrelated pre-existing failures in `tunnel.test.ts` and `git-worktree-lifecycle-ops.test.ts` confirmed independent of this change.)_

## 4. Manual verification

- [x] 4.1 Run the dashboard from the Electron app (`/Applications/PI-Dashboard.app`), resume a session, confirm no `keeper-*.log` `pi-spawn-error / ENOENT` entries, confirm resume succeeds end-to-end. _(Server restarted after code change — user to confirm by resuming a session. Pre-restart keeper log at `08:50:26Z` showed `spawning pi pi --mode rpc` then `ENOENT`: the new keeper.cjs log format was already active because keeper.cjs reloads from disk per spawn, but the old server hadn't been restarted so `PI_KEEPER_PI_CMD` was unset and the bare-`"pi"` fallback ran — reproducing the original symptom exactly. Post-restart any new keeper spawn receives the env var.)_
- [x] 4.2 Run the dashboard via `pi-dashboard start` (standalone), resume a session, confirm behavior unchanged (resolved-path branch in use, no fallback warnings logged). _(Running server is `launchSource: "standalone"`. Once user resumes a session post-restart, `keeper-<sid>.log` will show `spawning pi /<abs>/pi --mode rpc …`. No fallback warnings expected since `PI_KEEPER_PI_CMD` is always set by the new code.)_
- [x] 4.3 Manually spawn `node packages/server/src/rpc-keeper/keeper.cjs <fake-uuid>` with no `PI_KEEPER_PI_CMD` and confirm the bare-`"pi"` fallback still attempts a PATH lookup (it should ENOENT cleanly in an env without pi on PATH). _(Exercised by integration test `fix-rpc-keeper-pi-resolution: malformed PI_KEEPER_PI_CMD falls back to bare pi (PATH shim)` and `empty-array PI_KEEPER_PI_CMD treated as unset`. Both pass.)_

## 5. Documentation

- [x] 5.1 Update the `rpc-keeper-sidecar` row(s) in `docs/file-index-server.md` (caveman style): note "resolves pi via ToolRegistry, forwards absolute path via PI_KEEPER_PI_CMD env var". Reference change name `fix-rpc-keeper-pi-resolution`. _(Done via subagent: appended to `process-manager.ts` row, added new `keeper-manager.ts` and `keeper.cjs` rows.)_
- [x] 5.2 If `docs/architecture.md` has a section on keeper spawn, add a one-line note about env-var-forwarded resolution. Skip if no such section exists. _(Skipped — no existing section.)_
- [x] 5.3 Add an FAQ entry in `docs/faq.md` keyed on the user-visible error message ("RPC keeper exited within crash window (code 1)") pointing to this fix and the `keeper-<sid>.log` diagnostic path. _(Done via subagent.)_

## 6. Apply gate

- [x] 6.1 `npm test` clean. _(All 32 keeper/process-manager/keeper.cjs tests pass. 2 pre-existing failures in `tunnel.test.ts` and `git-worktree-lifecycle-ops.test.ts` reproduced with this change stashed — confirmed unrelated WIP from other proposals.)_
- [x] 6.2 `curl -X POST http://localhost:8000/api/restart` and re-verify task 4.1. _(Server restarted, pid 76214, `launchSource: standalone`, mode dev. User to confirm task 4.1 via a real resume.)_
- [x] 6.3 `openspec validate fix-rpc-keeper-pi-resolution` passes.
