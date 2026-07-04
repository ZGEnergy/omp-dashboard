# Tasks

## 1. Pin the divergence with a failing test
- [ ] 1.1 Unit test: build an env for argv `[<electron-binary>, cli.js]` (injected `execPath`/`electronVersion` mimicking packaged Electron) via `process-manager.buildSpawnEnv` vs `runner.buildSpawnEnvForArgv`. → verify: pre-fix, `process-manager` result LACKS `ELECTRON_RUN_AS_NODE` while `runner` sets it (builders disagree → test fails).

## 2. D1 — extract one shared electron-as-node predicate
- [ ] 2.1 Lift the `argv0 === execPath && Boolean(electronVersion)` decision out of `runner.buildSpawnEnvForArgv` into a pure, dep-injectable helper. → verify: unit-tested in isolation; `buildSpawnEnvForArgv` behavior unchanged.

## 3. D2 — apply the predicate at every node-wrapped execPath spawn under the stripped env
- [ ] 3.1 Thread the resolved `argv` (or `argv[0]`) into `process-manager.buildSpawnEnv` as an OPTIONAL param; when the predicate matches, set `ELECTRON_RUN_AS_NODE=1`. → verify: absent param ⇒ byte-identical to today.
- [ ] 3.2 Apply at `spawnWt` (:433, pi argv) and `spawnHeadless` (:471, forwarded pi argv). → verify: Electron-binary argv[0] ⇒ flag set. Do NOT touch `spawnTmux`/`spawnWslTmux` (not node-wrapped).
- [ ] 3.3 Guard the RPC keeper's OWN spawn: `keeper-manager.ts:172,:53-57` sets `ELECTRON_RUN_AS_NODE=1` on `keeperEnv` when `nodeBinary === process.execPath` under Electron (via the shared predicate). → verify: `[execPath, keeper.cjs]` spawn carries the flag independently of the pi argv.

## 4. Regression + safety gates
- [ ] 4.1 Turn 1.1 into a permanent regression: both env builders yield `ELECTRON_RUN_AS_NODE=1` for an Electron-binary argv[0]. → verify: green post-fix.
- [ ] 4.2 Healthy-path invariant: real `node` resolvable ⇒ argv[0] is real node, predicate no-op, non-Electron spawn env byte-identical. → verify: equality assertion.
- [ ] 4.3 Confirm excluded vectors stay untouched: `pi-core-updater` + `package-manager-wrapper` (inherit flag), `spawnTmux`/`spawnWslTmux` (shell token), `runner.buildSpawnEnvForArgv` (already argv-aware) get no behavior change. → verify: no edits / snapshot equal.
- [ ] 4.4 `definitions.ts` `nodeScriptToArgv` fallback UNEDITED (avoid conflict with `fix-node-electron-resolution-test-isolation`). → verify: `git diff` shows no change to lines 426-434.
- [ ] 4.5 Full `npm test` green; no edits under `packages/electron/`. → verify: `git diff --name-only` = `packages/shared/**` + `packages/server/**` (incl. `rpc-keeper/`) only.

## 5. Close out
- [ ] 5.1 `openspec validate fix-nodescript-argv-electron-execpath-fallback --strict`. → verify: passes.
- [ ] 5.2 Note the optional "run `pi-dashboard repair`" hint as a follow-up (design Open Questions). → verify: recorded.
