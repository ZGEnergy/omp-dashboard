## Context

The argv and its env obligation are decided in different modules and can desync:

```
DECIDE ARGV                          DECIDE ENV
definitions.ts:426 nodeScriptToArgv  (A) runner.buildSpawnEnvForArgv  → re-adds flag  (argv-aware)  ✅
  └ fallback [execPath, cli.js]      (B) process-manager.buildSpawnEnv → strips flag  (argv-blind)  ❌ THE BUG
keeper-manager.ts:172                      └ spawnWt (pi argv)
  └ [execPath, keeper.cjs]                  └ spawnHeadless → keeper: [execPath,keeper.cjs] + pi argv
       execPath MAY be Electron
```

When `execPath` is the Electron GUI binary, the child runs as node **iff** `ELECTRON_RUN_AS_NODE=1` is on its env. Path (A) guarantees it (`runner.ts:125-157`, `electronAsNode = Boolean(electronVersion) && execCmd === execPath`). Path (B) strips it (`binary-lookup.ts:454-461`) and has no argv to re-derive it from. The affected node-wrapped spawns under (B) are `spawnWt` and the `spawnHeadless`→keeper path (which spawns BOTH `[execPath, keeper.cjs]` and the forwarded pi argv). `spawnTmux`/`spawnWslTmux` do NOT node-wrap (shell token `pi`) — excluded.

### Reachability (scoped)

`argv[0]` is the Electron binary only in the **triply-degraded** install: the `node` strategy chain (override→bundled→managedRuntime→managedBin→where; `managedBin` for `node` is effectively empty) fully fails — i.e. server on the Electron binary (`pick-node.ts` execpath-fallback) AND no managed `~/.pi-dashboard/node` AND no PATH `node`. Any one real node makes `resolve("node")` succeed and the bug vanishes. Narrow, but a real silent-failure corner before `pi-dashboard repair`.

### Vectors examined and excluded (from doubt review)

- **`pi-core-updater`** passes `prependManagedNodeToPath(process.env)`; the server's `process.env` already carries `ELECTRON_RUN_AS_NODE=1` in this topology (`launch-source.ts:343` sets it on the spawned server's own env), so the npm child inherits it. Not a bug — do not "fix".
- **`package-manager-wrapper`** node-wraps npm on Windows but its spawns inherit `process.env` (no strip) — same inheritance as `pi-core-updater`. Safe.
- **`spawnTmux` / `spawnWslTmux`** build a shell string (`cd <cwd> && pi`); `pi` is a shell PATH token, not a node-wrapped argv. Different failure mode; out of scope.
- **`runner.buildSpawnEnvForArgv`** is already argv-aware. It is the reference implementation to extract from, not to change.

## Goals / Non-Goals

**Goals**
- One authoritative rule — `argv[0] === electron-execPath (under Electron) ⇒ ELECTRON_RUN_AS_NODE=1` — enforced at every executor spawn site.
- Eliminate the `process-manager.buildSpawnEnv` strip-without-readd gap for node-wrapped executor argv.
- Zero behavior change on healthy installs, standalone CLI, and the already-correct runner/pi-core-updater paths.

**Non-Goals**
- **Not** changing `nodeScriptToArgv`'s fallback branch. That branch runs only after bundled+managed+where already failed, so there is no new real-node source to "prefer" — an earlier D1 ("resolve real node harder in the fallback") was incoherent and is dropped. Correctness is enforced at the env layer instead. (This also keeps the branch conflict-free with `fix-node-electron-resolution-test-isolation`, which injects an `execPath` seam there.)
- Not fixing the corrupted install itself (`pick-node.ts` / repair flow).
- No new user-facing UI.

## Decisions

### D1 — Extract one shared electron-as-node predicate
Lift the decision out of `runner.buildSpawnEnvForArgv` into a small pure helper, e.g.:

```
electronAsNodeRequired(argv0: string, deps?: { execPath?; electronVersion? }): boolean
  = Boolean(electronVersion ?? process.versions.electron) && argv0 === (execPath ?? process.execPath)
```

`buildSpawnEnvForArgv` calls it (behavior unchanged). Deps injectable for deterministic tests.

### D2 — Apply the predicate at every node-wrapped `argv[0] = execPath` spawn under the stripped env
Two call paths spawn a node-wrapped `argv[0] = process.execPath` under a `process-manager.buildSpawnEnv`-stripped env:
- `spawnWt` (:433) — the `resolvePiCommand()` pi argv.
- `spawnHeadless` (:471) → keeper — the keeper's OWN `[nodeBinary=process.execPath, keeper.cjs]` (`keeper-manager.ts:172, :53-57`), AND the forwarded pi argv (`PI_KEEPER_PI_CMD`).

Apply the shared predicate (D1) to `argv[0]` at each: when it matches the Electron binary, set `ELECTRON_RUN_AS_NODE=1` on the env passed to that spawn. Because `buildSpawnEnv` has no argv, pass the resolved argv (or `argv[0]`) into it, or post-process its result at the spawn site. For the keeper, guard `keeperEnv` against `nodeBinary` (not the pi argv). Keep `resolver.buildSpawnEnv` as the argv-blind primitive; the re-add lives in the argv-aware callers. `spawnTmux`/`spawnWslTmux` are untouched (not node-wrapped).

**D1+D2 together** are the fix. There is no D3 signal-on-resolution (an earlier `needsElectronRunAsNode` field idea) — it pushes the obligation onto every call site instead of centralizing it, and the predicate + single chokepoint achieve the same guarantee with less surface.

## Risks / Trade-offs
- **Risk:** threading argv into `process-manager.buildSpawnEnv` touches a hot, widely-called function. Mitigate: make the argv param optional; when absent, behavior is byte-identical to today. Only the four executor spawn sites pass it.
- **Risk:** double-setting the flag if a caller both inherits it and re-adds it — harmless (idempotent set to `"1"`).
- **Trade-off:** the fix guards a narrow (triply-degraded) topology. Justified because the failure is silent (GUI-relaunch + single-instance-lock exit) and the guard is cheap + fully covered by a builder-agreement regression test.

## Migration Plan
Internal refactor; no config/API/persisted-format change. Land D1 + D2 with a regression test pinning agreement between `process-manager.buildSpawnEnv` and `runner.buildSpawnEnvForArgv` for an Electron-binary `argv[0]`. Sequence after (or rebase onto) `fix-node-electron-resolution-test-isolation` since both touch `definitions.ts:426-431` — though this change now leaves that branch unedited, minimizing conflict.

## Open Questions
- Should the triply-degraded fallback additionally surface a "run `pi-dashboard repair`" hint (as `pi-core-updater` already does for npm)? Out of scope for this bug fix; worth a follow-up.
