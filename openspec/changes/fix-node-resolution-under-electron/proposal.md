## Why

Settings → Tools shows `node` as ❌ **not found** on a packaged Electron install — even though the dashboard is, demonstrably, running on Node right now. Reproduced on macOS arm64 (PI-Dashboard.app v0.5.x):

```
node     —              not found
git      system         /usr/bin/git
```

Yet the bundled Node is sitting right there:

```
/Applications/PI-Dashboard.app/Contents/Resources/node/bin/node    (105 MB, executable)
```

Tracing the current strategy chain for `binaryDef("node")` in `packages/shared/src/tool-registry/definitions.ts:51`:

```
1. override                       — no override set
2. managedRuntimeStrategy("node") — checks <homedir>/.pi-dashboard/node/bin/node
                                    → ~/.pi-dashboard/ no longer exists post
                                      eliminate-electron-runtime-install
                                    → miss
3. managedBinStrategy("node")     — checks <managedDir>/node_modules/.bin/node
                                    → same dir gone → miss
4. whereStrategy("node")          — ToolResolver.which("node") with
                                    useLoginShell: true → opens $SHELL login,
                                    runs `which node` → user's zsh PATH does
                                    not include Electron's Resources/node/bin
                                    → miss
```

Every slot misses. The registry returns `{ ok: false }` even though `process.execPath` (well — `pickNodeForServer()`'s chosen path) IS the Resources/node binary. The registry has no strategy that probes `process.resourcesPath`.

The same bug affects `npm` (executor) and `npx` (registered by the companion proposal `register-bash-and-tool-install-help`). All three live under `<resourcesPath>/node/bin/` (Unix) or `<resourcesPath>/node/` (Windows) and none are findable by the registry.

Downstream impact:

- **User confusion**: Settings → Tools shows red `❌ node` while the dashboard is running. Indistinguishable, by UI alone, from a genuine missing-tool condition.
- **Override workaround is the only escape**: the user must manually set `~/.pi/dashboard/tool-overrides.json` pointing at `/Applications/PI-Dashboard.app/Contents/Resources/node/bin/node`. Only documented in source comments.
- **Future callers that route through the registry break**: any new code that does `registry.resolve("node")` to spawn a Node child process under Electron will fail spuriously. The recently-added `pi-core-updater.ts` is one of these; it works today only because it special-cases Electron via a separate code path that bypasses the registry.

The fix already exists in spirit at `packages/electron/src/lib/pick-node.ts` (`pickNodeForServer` + `bundledNodeDirFromResources`). That helper picks the bundled Node directly off `process.resourcesPath` for the server-spawn use case — exactly the strategy the registry is missing.

## What Changes

### Part 1 — New `bundledNodeStrategy`

- Add `bundledNodeStrategy(toolName: "node" | "npm" | "npx", deps?)` to `packages/shared/src/tool-registry/strategies.ts`. Mirrors the existing `managedRuntimeStrategy` but roots at `process.resourcesPath` instead of `<homedir>/.pi-dashboard/`.
- Probes:
  - Unix: `<resourcesPath>/node/bin/<name>`
  - Windows: `<resourcesPath>/node/<name>.exe` for `node`, `<resourcesPath>/node/<name>.cmd` for `npm`/`npx`
- Returns `{ ok: false, reason: "no resourcesPath" }` when not running under Electron (`process.resourcesPath` is undefined, or equals an exec-path-derived fallback that does not contain `node/`).
- `StrategyCtx` already carries the `env` field; the strategy reads `env.resourcesPath` (new optional field) for testability — falls through to `process.resourcesPath` when unset, mirroring how `managedRuntimeStrategy` consumes `env.homedir`.

### Part 2 — Wire `bundledNodeStrategy` into the `node`/`npm`/`npx` chains

- Extend `binaryDef()` in `packages/shared/src/tool-registry/definitions.ts` so the `node` chain becomes:

  ```
  override → bundledNode → managedRuntime → managedBin → where
  ```

  Insertion order rationale: `override` always wins. `bundledNode` runs BEFORE `managedRuntime` because the Electron-bundled Node is the dashboard's own runtime — if the user installed Electron, they implicitly opted into the bundled Node. A user who wants a different Node sets an override.

- Update `npmExecutorDef` (in the same file) to include `bundledNodeStrategy("npm")` in its strategy chain at the same insertion point.

- Update the `npx` binary registration (added by the companion proposal `register-bash-and-tool-install-help`) — or, if that proposal lands later, this change adds `npx` registration with the bundled-node strategy baked in from the start.

### Part 3 — `StrategyCtx.env.resourcesPath` field

- Extend `StrategyCtx` (`packages/shared/src/tool-registry/types.ts`) and the `PlatformEnv`-like surface (`packages/shared/src/managed-paths.ts` / `managed-node-path.ts`) with an optional `resourcesPath?: string` field.
- Wiring: `ToolRegistry`'s ctx builder reads `process.resourcesPath` when constructing `StrategyCtx.env`, identically to how it currently reads `os.homedir()`. Tests inject the value via `new ToolRegistry({ env: { resourcesPath: "/fake/Resources" } })`.

### Part 4 — Test families

- New `packages/shared/src/tool-registry/__tests__/bundled-node-strategy.test.ts`: unit-tests the strategy in isolation — present-Unix, present-Windows, absent (no resourcesPath), absent (resourcesPath exists but `node/` dir does not).
- Extend `packages/shared/src/__tests__/bootstrap/families/` with a `node-electron-resolution.test.ts` covering the full chain under three layouts:
  - Electron packaged (resourcesPath set, bundled-node present) → resolves via `bundled-node`, source `"bundled"`.
  - Electron dev (resourcesPath set but pointing at repo, no bundled-node) → falls through to `where`, source `"system"`.
  - Standalone CLI (resourcesPath unset) → behaves identically to today, source `"system"` or `"managed"`.

### Part 5 — Source classification

- Add `"bundled"` to the `Source` union in `packages/shared/src/tool-registry/types.ts`. Settings → Tools renders it as a new source badge with a tooltip "Shipped with this Electron install."

### Part 6 — Doctor + UI smoke

- `packages/electron/src/lib/doctor.ts` already invokes `runSharedChecks` which uses the registry; the false-positive "node not detected" doctor row disappears automatically once the strategy lands.
- `packages/client/src/components/ToolsSection.tsx` gains a source-badge class for `"bundled"`. No new dropdown — the row's `ok === true` so no install hint is shown.

## Capabilities

### New Capabilities

(none — this change extends an existing capability)

### Modified Capabilities

- `tool-registry`: Introduces a new `bundledNodeStrategy` that resolves `node` / `npm` / `npx` against `process.resourcesPath/node/` when the dashboard runs under Electron. Adds `"bundled"` to the `Source` classification. Specifies `StrategyCtx.env.resourcesPath` as the injectable input.

## Impact

- **Code (new files)**:
  - `packages/shared/src/tool-registry/__tests__/bundled-node-strategy.test.ts` (~80 lines).
  - `packages/shared/src/__tests__/bootstrap/families/node-electron-resolution.test.ts` (~100 lines).

- **Code (modified files)**:
  - `packages/shared/src/tool-registry/strategies.ts` — `+bundledNodeStrategy(...)` (~40 lines).
  - `packages/shared/src/tool-registry/definitions.ts` — wire strategy into `node` / `npm` / `npx` chains; update `classify()` to map the new strategy name to `"bundled"`.
  - `packages/shared/src/tool-registry/types.ts` — `+"bundled"` to `Source` union; `+resourcesPath?: string` to `StrategyCtx.env`.
  - `packages/shared/src/tool-registry/registry.ts` — ctx builder reads `process.resourcesPath` into `env.resourcesPath`.
  - `packages/client/src/components/ToolsSection.tsx` — source-badge class for `"bundled"` (cosmetic, ~5 lines).

- **Migration**: none. Existing chain order is preserved for non-Electron callers (`bundledNodeStrategy` fast-fails when `resourcesPath` is undefined). Override behavior unchanged. Existing tests pass without modification — the strategy is additive.

- **Compatibility**:
  - REST `/api/tools` response gains potential `source: "bundled"` rows. Clients that hard-code the source enum may need updating; the existing client tolerates unknown strings (falls back to no-badge).
  - The `Source` union widening is a TypeScript-level breaking change for downstream consumers — internal-only today, no external API impact.

- **Rollback**: revert the change directory. Existing behavior restored: Electron-bundled Node remains invisible to the registry, but the bug was latent (no production callsite breaks).

- **Cross-references**:
  - **Companion to** `register-bash-and-tool-install-help`. That proposal adds the `npx` registration; this one ensures `node` / `npm` / `npx` resolve correctly under Electron. Either order of landing is safe — the two proposals do not conflict.
  - **Unblocks** future work that wants to spawn Node via the registry under Electron (e.g. spawning pi sessions through `registry.resolve("node")` instead of going through `pickNodeForServer`).
