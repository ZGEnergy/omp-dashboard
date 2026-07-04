## Why

`nodeScriptToArgv` (the shared `toArgv` for Node-script executors — `npm`, `pi`, `openspec`) node-wraps a `.js` entry point and, when `registry.resolve("node")` fails, falls back to `process.execPath`:

```
// packages/shared/src/tool-registry/definitions.ts:426
const nodeScriptToArgv = (resolvedPath, { platform, registry }) => {
  const scriptPath = resolveJsScript(resolvedPath, platform);
  if (scriptPath) {
    const node = registry.resolve("node");
    if (node.ok && node.path) return [node.path, scriptPath];
    return [process.execPath, scriptPath];   // ← argv[0] may be the Electron GUI binary
  }
  return [resolvedPath];
};
```

### When is `argv[0]` actually the Electron binary? (narrow — a triply-degraded install)

The `process.execPath` fallback fires **only after the whole `node` strategy chain fails** (`definitions.ts:167-181`): override → `bundledNodeStrategy` → `managedRuntimeStrategy` → `managedBinStrategy` → `whereStrategy`. (`managedBinStrategy` for `node` probes `~/.pi-dashboard/node_modules/.bin/node`, which is effectively never populated, so it is not load-bearing.) So `argv[0]` is the Electron binary **only** when *all* of these hold simultaneously:

1. The server itself runs under Electron with `process.execPath` = the Electron GUI binary (the `execpath-fallback` topology from `pick-node.ts` — bundled Node missing), AND
2. no managed runtime `node` exists at `~/.pi-dashboard/node/bin/node` (`managedRuntimeStrategy` fails), AND
3. no `node` is on the child's PATH (`whereStrategy` fails).

This is a **triply-degraded install** — a corrupted app *before* `pi-dashboard repair` restores a runtime. It is not "bundled node missing" alone; a managed runtime or any PATH `node` makes `resolve("node")` succeed and `argv[0]` a real node. The bug is narrow, but reachable, and it degrades silently.

### The actual defect — an argv-blind env builder that strips the flag

The Electron binary behaves as `node` only with `ELECTRON_RUN_AS_NODE=1` on the child env. Two spawn-env builders in the tree handle this differently:

| Env builder | Electron handling | argv-aware? |
|---|---|---|
| `runner.buildSpawnEnvForArgv` (shared) | **Re-adds** `ELECTRON_RUN_AS_NODE=1` when `argv[0] === execPath` under Electron (`runner.ts:125-157`) | yes |
| `process-manager.buildSpawnEnv` (server) → `resolver.buildSpawnEnv` | **Strips** `ELECTRON_RUN_AS_NODE` (`binary-lookup.ts:454-461`) and never re-adds | **no** — has no argv |

`process-manager.buildSpawnEnv` (`process-manager.ts:166-171`) strips `ELECTRON_RUN_AS_NODE` and has no argv to re-derive it from. The spawn sites that produce a **node-wrapped `argv[0] = process.execPath`** under that stripped env are:

- **`spawnWt`** (`process-manager.ts:433`) — calls `resolvePiCommand()` → `resolver.resolvePi()` → node-wrapped `[<execPath>, cli.js]`.
- **`spawnHeadless`** (`process-manager.ts:471`) → `spawnHeadlessViaKeeper` → the **RPC keeper**, which spawns **two** node-wrapped argvs under the same stripped env: its own `[<execPath>, keeper.cjs]` (`rpc-keeper/keeper-manager.ts:172` `nodeBinary = ?? process.execPath`, spawned at `:53-57` with `env: keeperEnv`), and pi via `PI_KEEPER_PI_CMD` (the `resolvePiCommand()` argv forwarded from `spawnHeadless`).

**Not affected: `spawnTmux` / `spawnWslTmux`.** These do NOT node-wrap — `buildTmuxCommand` (`process-manager.ts:216-225`) builds a literal shell string `` `cd <cwd> && pi <flags>` `` and `pi` is resolved by the inner shell's PATH. Their degraded-topology failure mode is `pi: not found` / `env: node: No such file`, not a GUI relaunch — a different bug, out of scope here.

In the triply-degraded topology any of the node-wrapped argvs above has `argv[0]` = the Electron binary under a stripped env. Result: spawning `[<Electron-binary>, cli.js|keeper.cjs]` re-launches the Electron GUI, which hits the single-instance lock and exits — the session never starts, surfacing as a silent no-op rather than a `node` error.

### What is NOT affected (scoped by the review)

- **`pi-core-updater` npm spawn is already safe.** It passes `prependManagedNodeToPath(process.env)` (`pi-core-updater.ts:123`). In the execpath-fallback topology the server's own `process.env` already carries `ELECTRON_RUN_AS_NODE=1` (re-added at `launch-source.ts:343` when `pick.kind === "execpath-fallback"`), so the child inherits the flag. No fix needed there — earlier drafts wrongly flagged it.
- **`package-manager-wrapper`** node-wraps npm on Windows (`package-manager-wrapper.ts:38-48`), but its spawns inherit `process.env` (no strip), so — like `pi-core-updater` — the child inherits `ELECTRON_RUN_AS_NODE=1`. Safe.
- **Spawns routed through `runner.buildSpawnEnvForArgv` are already safe** (the argv-aware re-add). The bug is confined to spawn sites that build env via `process-manager.buildSpawnEnv` / `resolver.buildSpawnEnv` (which strip) while spawning a node-wrapped `argv[0] = process.execPath` — i.e. `spawnWt` and the `spawnHeadless` keeper path.

This is the adjacent runtime bug deferred by `fix-node-electron-resolution-test-isolation` (design Non-Goals).

## What Changes

Make the divergence impossible: the `argv[0] === electron-execPath ⇒ ELECTRON_RUN_AS_NODE=1` rule must hold at **every** executor spawn site, not just the runner path.

- **Extract one shared predicate** (from `runner.buildSpawnEnvForArgv`) that, given an `argv[0]` and the live `execPath`/`electronVersion`, decides whether `ELECTRON_RUN_AS_NODE=1` must be set (`argv[0] === execPath` under Electron). The predicate is script-agnostic — it fires for `cli.js` and `keeper.cjs` alike.
- **Apply the predicate wherever a node-wrapped `argv[0] = process.execPath` is spawned under a stripped `process-manager.buildSpawnEnv` env:** `spawnWt` (pi argv) and the `spawnHeadless` → RPC-keeper path (keeper's own `[<execPath>, keeper.cjs]` spawn AND the forwarded pi argv). So the flag is re-added instead of only stripped.
- **No change** to `spawnTmux`/`spawnWslTmux` (not node-wrapped), to healthy installs (real node resolves → `argv[0]` is a real node → predicate does nothing), to standalone CLI, or to `runner.buildSpawnEnvForArgv` (already correct).

Explicitly **out of scope**: `nodeScriptToArgv`'s fallback branch itself is left unchanged. An earlier draft proposed "prefer a real node harder in the fallback," but that branch only runs *after* bundled+managed+where already failed — there is no additional real-node source to consult, so the argv contract stays as-is and correctness is enforced at the env layer.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `tool-registry`: when a Node-script executor node-wraps to the host `process.execPath` and that interpreter is the Electron binary, **every** spawn-env builder that spawns the resulting argv SHALL set `ELECTRON_RUN_AS_NODE=1` on the child env; no builder SHALL strip that flag for such an argv. Healthy installs (a real `node` resolves) SHALL be unaffected and SHALL NOT add `ELECTRON_RUN_AS_NODE` via the executor path.

## Impact

- `packages/shared/src/platform/runner.ts` — extract the `argv[0] === electron-execPath ⇒ set flag` decision from `buildSpawnEnvForArgv` into a reusable, unit-tested predicate; `buildSpawnEnvForArgv` keeps current behavior.
- `packages/server/src/process-manager.ts` — `spawnWt` (:433) and the `spawnHeadless` (:471) path apply the predicate against the node-wrapped argv so the stripped flag is re-added when `argv[0]` is the Electron binary.
- `packages/server/src/rpc-keeper/keeper-manager.ts` — the keeper's own `[nodeBinary=process.execPath, keeper.cjs]` spawn (:172, :53-57) must set `ELECTRON_RUN_AS_NODE=1` on `keeperEnv` when `nodeBinary` is the Electron binary; likewise the keeper's downstream pi spawn from `PI_KEEPER_PI_CMD`.
- `packages/shared/src/platform/binary-lookup.ts` — `resolver.buildSpawnEnv` strips `ELECTRON_RUN_AS_NODE`; reconciliation lives above it (argv-aware caller) so this stays the argv-blind primitive.
- `packages/shared/src/tool-registry/definitions.ts` — **unchanged** (`nodeScriptToArgv` fallback preserved). Noted so an implementer does not "also fix" it and collide with `fix-node-electron-resolution-test-isolation`, which injects an `execPath` seam on the same branch.
- Not affected: `spawnTmux`/`spawnWslTmux` (shell token, not node-wrapped), `pi-core-updater.ts` + `package-manager-wrapper.ts` (inherit the flag from `process.env`), `runner.buildSpawnEnvForArgv` (already argv-aware).
- Reachable only in the triply-degraded `execpath-fallback` topology; healthy packaged Electron, managed-runtime installs, and standalone CLI are unaffected.

## Verification

- Repro (simulated): a `process-manager.buildSpawnEnv`-style env built for argv `[<electron-binary>, cli.js]` with `execPath`/`versions.electron` mimicking packaged Electron and NO real `node` resolvable → assert the built env contains `ELECTRON_RUN_AS_NODE=1` (fails pre-fix, passes post-fix).
- Regression: assert `process-manager.buildSpawnEnv` and `runner.buildSpawnEnvForArgv` **agree** for an Electron-binary `argv[0]` (both set the flag).
- Healthy path unchanged: with a real `node` resolvable, `nodeScriptToArgv` returns `[<real node>, cli.js]`, the predicate is a no-op, and the non-Electron spawn env is byte-identical to today.
- Full `npm test` green; no edits under `packages/electron/`.
