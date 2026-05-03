## 1. Bundle fix (precondition)

- [x] 1.1 Update `packages/electron/scripts/docker-make.sh` Windows branch to also `cp` `npm.cmd` and `npx.cmd` from `/tmp/node-$VERSION-win-$ARCH/` into `$NODE_DIR/` alongside the existing `node.exe` + `node_modules/` copies
- [x] 1.2 Add a script-text test at `packages/electron/src/__tests__/docker-make-windows-bundle.test.ts` that greps `docker-make.sh` for the `npm.cmd` and `npx.cmd` copy lines so the regression cannot land silently
- [ ] 1.3 Manually re-run a Windows packaged build locally (or via the Docker cross-build) and verify `<app>/resources/node/npm.cmd` exists and `npm.cmd --version` exits 0 _(deferred — manual VM QA, per session scope)_

## 2. Pure helpers (no production wire-up yet)

- [x] 2.1 Add `installManagedNode(managedDir)` to `packages/shared/src/bootstrap-install.ts`. Resolves source via `getBundledNodePath()` parent dir; copies recursively via `fs.cp`; writes `<managedDir>/node/.version` marker on success; idempotent skip when marker matches; replaces dir on mismatch; no-op when bundled source absent
- [x] 2.2 Add `prependManagedNodeToPath(env)` helper in `src/shared/platform/managed-node-path.ts`. Returns shallow-cloned env with `<managedDir>/node` (Windows) or `<managedDir>/node/bin` (Unix) prepended to `PATH`. No-op when managed runtime absent. Never mutates `process.env`
- [x] 2.3 Add `managedRuntime(toolName)` strategy to `src/shared/tool-registry/strategies.ts`. Returns the managed-runtime path for `node` or `npm` when present, else null
- [x] 2.4 Unit-test `installManagedNode` (memfs-backed): first-run copy writes marker; idempotent re-run is no-op; mismatch triggers re-copy; missing bundled source no-ops; partial-copy failure leaves no marker
- [x] 2.5 Unit-test `prependManagedNodeToPath`: prepends correct dir per OS; no-op when managed dir absent; returns distinct env object; does not mutate `process.env`
- [x] 2.6 Unit-test `managedRuntime` strategy in isolation: returns managed path when present; returns null when absent; OS-correct binary names

## 3. ToolRegistry wire-up

- [x] 3.1 Prepend `managedRuntime("node")` to the `node` strategy chain in `src/shared/tool-registry/definitions.ts` (before any `where`/PATH strategy, after the override strategy)
- [x] 3.2 Prepend `managedRuntime("npm")` to the `npm` strategy chain in the same file
- [x] 3.3 Add a chain-order test in `src/shared/tool-registry/__tests__/managed-runtime-strategy.test.ts`: managed-runtime present → returned; override file present → override wins; both absent → falls through to PATH lookup

## 4. Bootstrap chain wire-up

- [x] 4.1 Edit `packages/electron/src/lib/dependency-installer.ts::installAllTools` to invoke `installManagedNode(MANAGED_DIR)` before the first `bootstrapInstall(...)` call, emitting progress through the existing `onProgress` channel as a distinct step (e.g. `step: "node-runtime"`) _(wired into actual entry `installStandalone`; `step: "node-runtime"` emitted via the shared `installManagedNode` progress channel)_
- [x] 4.2 Verify `bootstrapInstall(...)` resolves npm via `ToolRegistry` (current code path through `resolveNpmArgv` already does — confirm and add a regression test if missing) _(regression test `bootstrap-install-resolve-npm.test.ts` added)_
- [x] 4.3 Add an integration-style test under `packages/shared/src/__tests__/install-managed-node-bootstrap-order.test.ts` asserting that `installAllTools` calls `installManagedNode` strictly before `bootstrapInstall` _(script-text test pinning the call-order in `installStandalone`)_

## 5. Spawn-site PATH injection

- [x] 5.1 Edit `src/server/process-manager.ts` to apply `prependManagedNodeToPath(env)` to every pi-session spawn's environment
- [x] 5.2 Edit `packages/server/src/pi-core-updater.ts::defaultRunNpmUpdate` to apply `prependManagedNodeToPath(env)` to the spawned `npm` child's environment
- [x] 5.3 Audit bridge-extension shell-command spawn paths (`!`/`!!`) in `src/extension/command-handler.ts`. If they spawn outside the inherited server env, apply `prependManagedNodeToPath` there too; document a one-line note if no change is needed _(NO CHANGE: bridge `pi.exec` inherits the bridge process env; the bridge runs inside a pi session spawned by `process-manager.ts::buildSpawnEnv` which already prepends managed Node — transitive inheritance covers it.)_
- [x] 5.4 Add tests in `src/server/__tests__/process-manager-managed-path.test.ts` and `packages/server/src/__tests__/pi-core-updater-managed-path.test.ts` asserting the spawned env has the managed dir prepended when present

## 6. pi-core-updater registry refactor

- [x] 6.1 Refactor `packages/server/src/pi-core-updater.ts::defaultRunNpmUpdate` to resolve the npm binary via `getDefaultRegistry().resolve("npm")` instead of `spawn("npm", ...)`. On unresolved, reject with a clear error naming `npm` (per spec scenario "ToolRegistry resolution failure surfaces a clear error"). Preserve the existing permission-error stderr-hint regex _(combined with task 5.2 commit)_
- [x] 6.2 Update `packages/server/src/__tests__/pi-core-updater.test.ts` to assert the resolved absolute path is invoked (not bare `"npm"`), to assert the unresolved-npm rejection surface, and to assert the permission-hint preservation _(covered by sibling new file `pi-core-updater-managed-path.test.ts` which exercises `defaultRunNpmUpdate` directly via test seams; existing `pi-core-updater.test.ts` continues to test the orchestrator via the `runNpmUpdate` test seam.)_

## 7. Doctor / repair wire-up

- [x] 7.1 Edit `packages/electron/src/lib/doctor.ts` to invoke `installManagedNode(MANAGED_DIR)` as part of its checks; surface result in the existing Doctor UI rows (`Node runtime`)
- [x] 7.2 Add a Doctor test asserting it re-copies on missing managed Node and on version-marker mismatch, and that it no-ops when the marker matches

## 8. Docs and cross-references

- [x] 8.1 Delegate to a general-purpose subagent: add a row for `installManagedNode` to `docs/file-index-shared.md` (or appropriate per-area split) in caveman style, in path-alphabetical order
- [x] 8.2 Delegate to a general-purpose subagent: add a row for `prependManagedNodeToPath` to `docs/file-index-shared.md` in caveman style
- [x] 8.3 Delegate to a general-purpose subagent: update `docs/architecture.md` bootstrap section with a one-paragraph caveman-style note explaining the managed-Node copy step and `~/.pi-dashboard/node/` layout
- [x] 8.4 Delegate to a general-purpose subagent: append a `docs/faq.md` entry "Why does `where npm` return nothing on Windows after install?" pointing at the managed Node directory and the PATH-inheritance behavior

## 9. Manual verification on Windows

- [ ] 9.1 Fresh Electron install on a Windows VM with no system Node. Confirm `~/.pi-dashboard/node/node.exe` and `npm.cmd` exist after first launch
- [ ] 9.2 Confirm `pi-dashboard start` works without system Node, and the dashboard's Settings → Pi Ecosystem **Update** button completes successfully (no `npm update exited with code 1`)
- [ ] 9.3 Confirm spawning a new pi session inherits the managed Node — `where npm` inside the session shows `~/.pi-dashboard/node/npm.cmd`
- [ ] 9.4 Confirm Doctor reports the managed Node row green and re-creates `~/.pi-dashboard/node/` after manual deletion

## 10. Manual verification on macOS / Linux

- [ ] 10.1 Fresh Electron install on macOS arm64 and Linux x64; confirm `~/.pi-dashboard/node/bin/node` and `bin/npm` exist
- [ ] 10.2 Confirm Update button works against a managed-source pi install
- [ ] 10.3 Confirm `tool-overrides.json` precedence: set an override pointing at a different node, restart, confirm `ToolRegistry` returns the override path
