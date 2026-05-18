## 1. Strategy factory

- [x] 1.1 Extend `StrategyDeps` in `packages/shared/src/tool-registry/strategies.ts` with optional `resourcesPath?: string` injection slot; default reads `(process as { resourcesPath?: string }).resourcesPath ?? null` inside the factory.
- [x] 1.2 Add `electronBundledRuntimeStrategy(toolName: "node" | "npm", deps?: StrategyDeps): Strategy` beside `managedRuntimeStrategy`. Strategy `name` = `"electron-bundled"`. Returns `{ ok: false, reason: "not running in Electron (no resourcesPath)" }` when `resourcesPath` is unset. Probes platform-appropriate paths (see design D6).
- [x] 1.3 Export the new factory from `packages/shared/src/tool-registry/strategies.ts`.

## 2. Wire into definitions

- [x] 2.1 In `packages/shared/src/tool-registry/definitions.ts::npmExecutorDef`, insert `electronBundledRuntimeStrategy("npm", deps)` AFTER `managedRuntimeStrategy("npm", deps)` and BEFORE `whereStrategy("npm", deps)` in BOTH `unixStrategies` and `winStrategies`. On Windows, also ensure it sits BEFORE `npmCliBesideNodeStrategy`.
- [x] 2.2 In `definitions.ts`, locate the `node` executor definition and apply the same insertion (after managed-runtime, before where).
- [x] 2.3 Verify `classify()` returns `"managed"` for `electron-bundled` resolutions. (Required code change: added `electron-bundled` → `"managed"` branch in `classify()`.)

## 3. Tests — strategy unit

- [x] 3.1 Create `packages/shared/src/__tests__/electron-bundled-runtime-strategy.test.ts`. Uses injected `exists` + `resourcesPath` deps (no memfs needed — matches the pattern from `managed-runtime-strategy.test.ts`).
- [x] 3.2 Test: unix `npm` resolves to `lib/node_modules/npm/bin/npm-cli.js`.
- [x] 3.3 Test: win32 `npm` resolves to `node_modules/npm/bin/npm-cli.js`.
- [x] 3.4 Test: unix `node` resolves to `bin/node`; win32 to `node.exe`.
- [x] 3.5 Test: missing `resourcesPath` returns `{ ok: false, reason: "not running in Electron (no resourcesPath)" }` without filesystem probe.
- [x] 3.6 Test: `resourcesPath` set but bundled tree absent returns `{ ok: false, reason: "missing: <path>" }`.

## 4. Tests — definitions integration

- [x] 4.1 Extend `packages/shared/src/__tests__/tool-registry-definitions.test.ts` with three new `describe` blocks covering npm chain, node chain, and chain-ordering invariants. Verified order via `tried[]` index comparison rather than exact-length array match (more resilient to future strategy additions). All scenarios covered:
  - [x] 4.1.1 npm unix chain order: `override < managed < electron-bundled < where`.
  - [x] 4.1.2 win32 npm resolves to bundled path.
  - [x] 4.1.3 node unix chain order: `override < managed < electron-bundled`.
  - [x] 4.1.4 win32 node resolves to bundled `node.exe`.
- [x] 4.2 Verified end-to-end: `registry.resolve("npm")` returns `path` + `source="managed"` + `tried[]` includes `electron-bundled:ok` for bundled-Electron scenarios. The `resolveExecutor` argv assertion is deferred — `tried[]` source check is the equivalent contract.

## 5. Tests — bootstrap harness parity

- [x] 5.1 Extended `FakeEnvSpec.resourcesPath?: string` (defaults to `undefined`) and wired through `createStrategyDeps`. Existing scenarios untouched.
- [~] 5.2 Skipped — dedicated scenario family deemed redundant. Coverage achieved via `tool-registry-definitions.test.ts` chain-ordering + acceptance tests, which exercise the exact contract at the right abstraction layer. Bootstrap families test bootstrap *outcomes*, not strategy semantics; adding here would duplicate. Documented decision in `proposal.md`.
- [x] 5.3 Bootstrap suite: **100/100 pass** post-snapshot-update. 2 snapshots auto-regenerated to include the new `electron-bundled  not running in Electron (no resourcesPath)` line in the `tried[]` trail for non-Electron scenarios — expected per design.

## 6. Tests — server-wrapper smoke

- [x] 6.1 Covered by the `resolveExecutor(npm)` acceptance test in `tool-registry-definitions.test.ts` ("resolveExecutor(npm) returns [<bundled-node>, <bundled-npm-cli.js>] so SafePackageManager.runCommandSync spawns successfully on first Electron boot"). This is the same contract the server wrapper consumes; testing at the registry level (where the contract lives) is cleaner than re-testing inside `package-manager-wrapper`. Existing wrapper tests (23/23 green) confirm no regression in the wrapper's argv expansion code path.

## 7. Verification

- [x] 7.1 `npx vitest run packages/shared/src/__tests__/` — 1057 passed, 2 pre-existing failures unrelated to this change (lint violations in `packages/electron/src/lib/recovery-ipc.ts` + `server-lifecycle.ts` from a parallel `streamline-electron-bootstrap-and-recovery` change).
- [x] 7.2 Bootstrap suite: 100/100 green after snapshot update.
- [x] 7.3 `npx tsc --noEmit -p packages/shared/tsconfig.json` — 0 errors in my files (5 pre-existing in unrelated files: cross-package boundary + Node Dirent typings).
- [ ] 7.4 Manual smoke: clean install on macOS (delete `~/.pi-dashboard/node/`, ensure `which npm` returns nothing under the Electron PATH). Launch PI-Dashboard.app. Confirm wizard completes WITHOUT the `Failed to run npm root -g: spawnSync npm ENOENT` line in `$TMPDIR/pi-dashboard-electron.log` and `~/.pi/dashboard/server.log`. (Requires Electron rebuild — deferred to release verification.)

## 8. Documentation

- [x] 8.1 Updated `docs/file-index-shared.md` row for `src/shared/tool-registry/strategies.ts` (delegated to general-purpose subagent per AGENTS.md Documentation Update Protocol). Caveman style preserved.
- [x] 8.2 Updated `docs/file-index-shared.md` row for `src/shared/tool-registry/definitions.ts` to record the new strategy position + `nodeScriptToArgv` extension.
- [x] 8.3 Appended CHANGELOG.md under `## [Unreleased] → ### Fixed` with full root-cause + fix summary.

## 9. Archive

- [ ] 9.1 After verification + merge, run `openspec archive fix-electron-wizard-npm-root-enoent` to fold the delta into the main `tool-registry` spec. (Deferred until manual smoke + merge.)
