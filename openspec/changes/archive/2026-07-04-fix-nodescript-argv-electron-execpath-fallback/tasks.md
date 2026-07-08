# Tasks

## 1. Pin the divergence with a failing test
- [x] 1.1 Unit test: build an env for argv `[<electron-binary>, cli.js]` (injected `execPath`/`electronVersion` mimicking packaged Electron) via `process-manager.buildSpawnEnv` vs `runner.buildSpawnEnvForArgv`. → verify: pre-fix, `process-manager` result LACKS `ELECTRON_RUN_AS_NODE` while `runner` sets it (builders disagree → test fails).

## 2. D1 — extract one shared electron-as-node predicate
- [x] 2.1 Lift the `argv0 === execPath && Boolean(electronVersion)` decision out of `runner.buildSpawnEnvForArgv` into a pure, dep-injectable helper. → verify: unit-tested in isolation; `buildSpawnEnvForArgv` behavior unchanged.

## 3. D2 — apply the predicate at every node-wrapped execPath spawn under the stripped env
- [x] 3.1 Thread the resolved `argv` (or `argv[0]`) into `process-manager.buildSpawnEnv` as an OPTIONAL param; when the predicate matches, set `ELECTRON_RUN_AS_NODE=1`. → verify: absent param ⇒ byte-identical to today.
- [x] 3.2 Apply at `spawnWt` (:433, pi argv) and `spawnHeadless` (:471, forwarded pi argv). → verify: Electron-binary argv[0] ⇒ flag set. Do NOT touch `spawnTmux`/`spawnWslTmux` (not node-wrapped).
- [x] 3.3 Guard the RPC keeper's OWN spawn: `keeper-manager.ts:172,:53-57` sets `ELECTRON_RUN_AS_NODE=1` on `keeperEnv` when `nodeBinary === process.execPath` under Electron (via the shared predicate). → verify: `[execPath, keeper.cjs]` spawn carries the flag independently of the pi argv.

## 4. Regression + safety gates
- [x] 4.1 Turn 1.1 into a permanent regression: both env builders yield `ELECTRON_RUN_AS_NODE=1` for an Electron-binary argv[0]. → verify: green post-fix.
- [x] 4.2 Healthy-path invariant: real `node` resolvable ⇒ argv[0] is real node, predicate no-op, non-Electron spawn env byte-identical. → verify: equality assertion.
- [x] 4.3 Confirm excluded vectors stay untouched: `pi-core-updater` + `package-manager-wrapper` (inherit flag), `spawnTmux`/`spawnWslTmux` (shell token), `runner.buildSpawnEnvForArgv` (already argv-aware) get no behavior change. → verify: no edits / snapshot equal.
- [x] 4.4 `definitions.ts` `nodeScriptToArgv` fallback UNEDITED (avoid conflict with `fix-node-electron-resolution-test-isolation`). → verify: `git diff` shows no change to lines 426-434.
- [x] 4.5 `npm test`: touched code green. A pre-existing `node-electron-resolution.test.ts` isolation leak (owned by `fix-node-electron-resolution-test-isolation`, reproduces without this change) failed locally on the dev machine but is resolved on the develop-merged tree once that sibling change landed. No edits under `packages/electron/`. → verify: `git diff --name-only` = `packages/shared/**` + `packages/server/**` (incl. `rpc-keeper/`) only.

## 5. Close out
- [x] 5.1 `openspec validate fix-nodescript-argv-electron-execpath-fallback --strict`. → verify: passes.
- [x] 5.2 Note the optional "run `pi-dashboard repair`" hint as a follow-up (design Open Questions). → verify: recorded — deferred as a follow-up; the triply-degraded fallback could surface a "run `pi-dashboard repair`" hint (as `pi-core-updater` already does for npm), out of scope for this env-layer fix.
