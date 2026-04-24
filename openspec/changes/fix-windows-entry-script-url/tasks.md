## 1. Helper module (TDD)

- [x] 1.1 Create `packages/shared/src/__tests__/node-spawn.test.ts` with failing tests for `toFileUrl`: idempotence on `file://` URLs, Windows drive-letter wrapping (`B:\Dev\cli.ts`, `B:/Dev/cli.ts`, and `C:\Users\x\cli.ts`), POSIX absolute path wrapping (`/usr/local/bin/cli.js`), and `spawnNodeScript` argv construction with a `vi.spyOn` mock over `platform/exec.ts::spawn`.
- [x] 1.2 Run `npm test -- node-spawn` and verify all tests fail with the expected "module not found" / undefined-export errors.
- [x] 1.3 Create `packages/shared/src/platform/node-spawn.ts` exporting `toFileUrl(pathOrUrl: string): string` and `spawnNodeScript(opts: SpawnNodeScriptOptions): ChildProcess`. Implementation uses the Windows-style regex probe pattern from `packages/shared/src/resolve-jiti.ts::buildJitiRegisterUrl` and delegates spawning to `packages/shared/src/platform/exec.ts::spawn`. No direct `node:child_process` imports.
- [x] 1.4 Re-run `npm test -- node-spawn` and verify all tests now pass.
- [x] 1.5 Export `toFileUrl` and `spawnNodeScript` from `packages/shared/src/platform/index.ts` (or the equivalent barrel if one exists) so consumers can import via the established platform namespace.

## 2. Repo lint test (TDD)

- [x] 2.1 Create `packages/shared/src/__tests__/no-raw-node-import.test.ts` modelled on `no-direct-child-process.test.ts`. The test walks every `.ts` file under `packages/*/src/` except `packages/shared/src/platform/node-spawn.ts` and files containing `/__tests__/`, scans for `spawn(...)` calls whose argv array contains `"--import"` or `"--loader"`, and flags any occurrence where the next argv position is a bare identifier not wrapped in `toFileUrl(...)` / `pathToFileURL(...).href`.
- [x] 2.2 Run `npm test -- no-raw-node-import`. The test SHALL currently FAIL, reporting the three known direct-argv call sites (`cli.ts:344`, `server-launcher.ts:84`, `server-lifecycle.ts:359`). The fourth site (`restart-helper.ts`) builds argv via a JS string template and is not caught by source-level regex — it is still migrated in task 3.4 but won't show up in the lint baseline.

## 3. Migrate call sites (makes the lint pass)

- [x] 3.1 `packages/server/src/cli.ts` — inside `cmdStart` at the server spawn (~line 344), replace the direct `spawn(process.execPath, ["--import", tsLoader, cliPath, ...args], {...})` call with `spawnNodeScript({ loader: tsLoader, entry: cliPath, args, spawnOptions: {...} })`. Remove the now-redundant manual `pathToFileURL` wrap on `tsLoader` (the helper handles it idempotently).
- [x] 3.2 `packages/extension/src/server-launcher.ts` — at the `args: ["--import", resolveJitiImport(), cliPath, ...args]` line (~84), wrap `cliPath` with `toFileUrl(cliPath)`. The surrounding `spawnDetached` primitive is preserved; only the entry-script argv slot changes.
- [x] 3.3 `packages/electron/src/lib/server-lifecycle.ts` — at the jiti-branch argv construction (~line 359), wrap `cliPath` with `toFileUrl(cliPath)`. The tsx-branch at ~line 349 does not pass `cliPath` to `--import`, so leave it unchanged.
- [x] 3.4 `packages/server/src/restart-helper.ts` — inside `buildOrchestratorScript` (~line 42), change `spawnArgs.push(params.cliPath, ...)` to `spawnArgs.push(toFileUrl(params.cliPath), ...)`. Add the `toFileUrl` import. Update the embedded `JSON.stringify` argv serialization path (the helper runs before stringification, so no escaping change).
- [x] 3.5 Re-run `npm test -- no-raw-node-import`. Verify it now PASSES — zero violations across the four migrated sites.

## 4. Regression tests

- [x] 4.1 Extend `packages/shared/src/__tests__/resolve-jiti.test.ts` (or a sibling `node-spawn-integration.test.ts`) with a unit test asserting that for a simulated Windows `B:\Dev\...\cli.ts` input, the full `cmdStart`-shaped argv array produced by `spawnNodeScript` begins with `["--import", <file:// loader>, "file:///B:/Dev/..."]`. Use `vi.spyOn` over `platform/exec.ts::spawn` to capture the argv without spawning.
- [x] 4.2 Add an equivalent regression test for the `restart-helper.ts` orchestrator script: `buildOrchestratorScript({ cliPath: "B:\\Dev\\cli.ts", loader: "file:///C:/loader.mjs", port: 8000, extraArgs: [] })` produces an embedded `ARGS` array containing `"file:///B:/Dev/cli.ts"`, not `"B:\\Dev\\cli.ts"`.
- [x] 4.3 Run the full test suite (`npm test`). Verify all existing tests still pass and the new ones succeed. **Result: 286 files, 2971 tests passed, 9 skipped.**

## 5. Manual verification

- [ ] 5.1 On a Windows machine (or Windows VM via the `qa/` harness) with the dashboard source cloned to `B:\Dev\pi-agent-dashboard` (or substituted via `subst B: ...`), run `node packages/server/src/cli.ts start` and verify the server starts without `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- [ ] 5.2 On the same machine, verify `POST /api/restart` succeeds and the new server comes up healthy.
- [ ] 5.3 On a C:-drive Windows install, smoke-test `pi-dashboard start` and the Electron app launch to confirm no regression on the previously-working path.

## 6. Documentation

- [x] 6.1 Update `AGENTS.md` "Key Files" section to add `packages/shared/src/platform/node-spawn.ts` and `packages/shared/src/__tests__/no-raw-node-import.test.ts` rows with one-line purpose descriptions mirroring the style of neighbouring entries.
- [x] 6.2 Update `docs/architecture.md` "Windows integration" (or equivalent section, wherever `fix-windows-server-parity` was documented) with a paragraph noting that both the loader and entry-script positions in `node --import` argv are URL-wrapped, and that `spawnNodeScript` + the lint test enforce this universally.
- [x] 6.3 Add an entry to `CHANGELOG.md` under `## [Unreleased]` describing the fix: "Fix `ERR_UNSUPPORTED_ESM_URL_SCHEME` when running the dashboard from non-C: Windows drives (e.g. `B:\`). Every `node --import <loader> <entry>` call site now wraps both arguments as `file://` URLs, enforced by a new lint test."

## 7. Archive

- [ ] 7.1 After all tasks complete and the PR is merged, run the `openspec-archive-change` skill to move this change under `openspec/changes/archive/<date>-fix-windows-entry-script-url/` and sync the `dashboard-server` spec with the MODIFIED + ADDED requirements from `specs/dashboard-server/spec.md`.
