# Tasks

## 1. New strategy — `bundledNodeStrategy`

- [x] 1.1 Add `bundledNodeStrategy(toolName: "node" | "npm" | "npx", deps?)` to `packages/shared/src/tool-registry/strategies.ts`. Mirror the shape and JSDoc style of `managedRuntimeStrategy`.
- [x] 1.2 Probe paths:
  - Unix: `<resourcesPath>/node/bin/<name>`
  - Windows: `<resourcesPath>/node/node.exe` for `node`, `<resourcesPath>/node/<name>.cmd` for `npm`/`npx`
- [x] 1.3 Read `resourcesPath` from `ctx.env.resourcesPath`. Return `{ ok: false, reason: "no resourcesPath" }` when unset (non-Electron case).
- [x] 1.4 Honor injected `exists` for testability — every fs probe MUST route through the dep, never call `existsSync` directly.

## 2. Types and ctx wiring

- [x] 2.1 Add `"bundled"` to the `Source` union in `packages/shared/src/tool-registry/types.ts`.
- [x] 2.2 Add optional `resourcesPath?: string` to the `env` field on `StrategyCtx` (and to any shared `PlatformEnv` surface it derives from — likely `packages/shared/src/managed-paths.ts` or sibling).
- [x] 2.3 Update `ToolRegistry`'s ctx builder (`packages/shared/src/tool-registry/registry.ts`) to populate `env.resourcesPath` from `process.resourcesPath` at construction.
- [x] 2.4 Update the `classify()` function in `definitions.ts` to map strategy name `"bundled-node"` (or whatever final name) to `Source = "bundled"`.

## 3. Chain wiring

- [x] 3.1 Extend `binaryDef()` in `definitions.ts` to insert `bundledNodeStrategy` before `managedRuntimeStrategy` for `node`. Resulting `node` chain: `override → bundled → managedRuntime → managedBin → where`.
- [x] 3.2 Update `npmExecutorDef` in `definitions.ts` to include `bundledNodeStrategy("npm")` at the same insertion point.
- [x] 3.3 Update `npx` registration (from companion proposal or freshly added) to include `bundledNodeStrategy("npx")` at the same insertion point. If `register-bash-and-tool-install-help` has not yet landed, this proposal SHALL add the `npx` registration directly (with `bundledNode` baked in) and the companion proposal SHALL be rebased to take this as a dependency.

## 4. Tests — strategy unit + bootstrap family

- [x] 4.1 New `packages/shared/src/tool-registry/__tests__/bundled-node-strategy.test.ts`:
  - Unix layout (`<resourcesPath>/node/bin/node` exists) → resolves, returns absolute path.
  - Windows layout (`<resourcesPath>/node/node.exe` exists) → resolves.
  - Windows layout for `npm`/`npx` (`.cmd` file present) → resolves with `.cmd` path.
  - `resourcesPath` unset → `{ ok: false, reason: "no resourcesPath" }`.
  - `resourcesPath` set but `node/` dir absent → `{ ok: false, reason: "missing: ..." }`.
- [x] 4.2 New `packages/shared/src/__tests__/bootstrap/families/node-electron-resolution.test.ts`:
  - Packaged Electron (resourcesPath + bundled-node present) → resolves via `bundled-node`, `Resolution.source === "bundled"`.
  - Electron dev (resourcesPath set but no bundled-node under it) → falls through to `where`, `source === "system"`.
  - Standalone CLI (resourcesPath unset) → behaves identically to today, no regression in `source` values.
- [x] 4.3 Extend `definitions.test.ts` to assert the updated chain order for `node`, `npm`, `npx`.
- [x] 4.4 Regression test: existing `managedRuntimeStrategy` tests continue to pass (the new strategy is upstream of it; ordering does not affect managedRuntime semantics when bundled-node misses).

## 5. UI — source badge

- [x] 5.1 Update `packages/client/src/components/ToolsSection.tsx` source-badge rendering to handle `"bundled"`. Pick a distinct color from `system` / `managed` / `override` / `npm-global` / `bare-import`. Suggested: a neutral-blue badge with tooltip "Shipped with this Electron install."
- [x] 5.2 Update any storybook / visual test fixtures that snapshot the badge set.
- [x] 5.3 Add a test for the new badge in the existing `ToolsSection` test file.

## 6. Doctor + smoke

- [x] 6.1 No code change needed in `packages/electron/src/lib/doctor.ts` — it consumes the registry. Verify the false-positive "node not detected" doctor row disappears post-patch via manual run of `[Help → Doctor]` in the packaged app.
- [x] 6.2 Confirm `/api/tools` REST response carries `source: "bundled"` for `node` / `npm` / `npx` on a packaged install.

## 7. Spec delta + validation

- [x] 7.1 Author `openspec/changes/fix-node-resolution-under-electron/specs/tool-registry/spec.md` with ADDED + MODIFIED requirements per the proposal.
- [x] 7.2 Run `openspec validate fix-node-resolution-under-electron --strict` and resolve any schema errors.
- [x] 7.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm no regressions.
- [x] 7.4 Manual smoke matrix:
  - macOS arm64 packaged app: Settings → Tools shows `node` ✓ with source badge `bundled`, path under `/Applications/PI-Dashboard.app/Contents/Resources/node/bin/node`.
  - macOS dev (`npm run electron-dev`): falls through to system Node on PATH, source `"system"`.
  - Windows packaged app: `node.exe` resolves under `<resourcesPath>\node\node.exe`, source `"bundled"`.
  - Linux AppImage: `node` resolves under the unpacked AppImage's `node/bin/node`, source `"bundled"`.
  - Standalone CLI (`pi-dashboard` from npm install): no `resourcesPath`, chain unchanged, source `"system"` or `"managed"`.
