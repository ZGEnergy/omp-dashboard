## Phase A — additive (no migration yet)

## 1. `ToolResolver.resolveJiti`

- [x] 1.1 Add `resolveJiti(opts?: { anchor?: string; resolver?: JitiResolver }): string | null` to `ToolResolver` in `packages/shared/src/platform/binary-lookup.ts`. Resolution order: managed pi install — try each entry of `["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"]` under `~/.pi-dashboard/node_modules/<pi-pkg>/package.json` → system pi via `which("pi")` (use ToolResolver's existing `which()`) → `opts.anchor` (resolved up to nearest `node_modules`) → `process.argv[1]`. For every anchor, walk `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]`. Returns the jiti register hook as a `file://` URL (preserve `buildJitiRegisterUrl` Windows drive-letter wrapping contract verbatim) or null. Carry over the `JitiResolver` type from `resolve-jiti.ts` and accept `opts.resolver` as the test seam (mirrors today's `pickJitiRegisterUrl` / `pickJitiFromAnchor`).
- [x] 1.2 Port unit tests from `packages/shared/src/__tests__/resolve-jiti.test.ts` onto `ToolResolver.resolveJiti`: managed-pi hit (upstream `@earendil-works`), managed-pi hit (legacy `@mariozechner`), system-pi hit, anchor walk-up, argv fallback, all-miss → null, Windows drive-letter URL wrapping, symlink realpath behavior, upstream `jiti` chosen first vs legacy `@mariozechner/jiti` fallback, `which("pi")` mocked.

## 2. `launchDashboardServer`

- [x] 2.1 Create `packages/shared/src/server-launcher.ts`. Export `launchDashboardServer(opts: LaunchOpts): Promise<{ childPid: number; reportedPid: number | null; healthOk: boolean }>` and typed errors `JitiNotFoundError`, `PortConflictError`, `EarlyExitError`. `LaunchOpts`: `nodeBin?` (default `process.execPath`), `cliPath`, `extraArgs?`, `anchor?`, `env?` (default `ToolResolver.buildSpawnEnv()` merged with caller overrides), `stdio: "ignore" | { logFile: string }`, `healthTimeoutMs`, `port`.
- [x] 2.2 Internal flow:
  1. `loader = ToolResolver.resolveJiti({ anchor })`; throw `JitiNotFoundError` if null.
  2. If `stdio: { logFile }`: `mkdirSync(dirname(logFile), { recursive: true })`, `openSync(logFile, "a")`, write `[<ISO>] <starter?> launch (parent pid <pid>, port <port>, cli <cliPath>)\n`, pass `[fd, fd]` as stdout/stderr; close parent fd after spawn.
  3. Spawn via `spawnNodeScript({ loader, entry: cliPath, args: extraArgs, spawnOptions: { detached: true, stdio, env } })` (entry URL-wrapping handled by `spawnNodeScript`'s existing `shouldUrlWrapEntry` rule).
  4. Readiness loop: poll `isDashboardRunning(port)` from `packages/shared/src/server-identity.ts` every 300 ms. Resolve when `running` is true (return `{ healthOk: true, reportedPid: status.pid ?? null, childPid: child.pid }`). Throw `PortConflictError` if `portConflict` is true. Throw `EarlyExitError({ code: child.exitCode })` if `child.exitCode !== null`. Throw `Error("readiness timeout")` after `healthTimeoutMs`.
- [x] 2.3 Add `buildNodeImportArgvParts({ loader, entry, args }): string[]` to `packages/shared/src/platform/node-spawn.ts` returning the bare argv chunk (`["--import", toFileUrl(loader), <wrapped-or-raw entry>, ...args]`). `spawnNodeScript` and `restart-helper.ts` both call this helper. Pure function — no I/O.
- [x] 2.4 Unit tests for the launcher (mock `spawnDetached` / `child_process.spawn`, `fetch`, `fs.openSync`, and `ToolResolver.resolveJiti`):
  - jiti hit → spawn argv shape correct (delegates to `spawnNodeScript`).
  - jiti miss → throws `JitiNotFoundError` before any spawn.
  - log-file stdio: header line written, parent fd closed.
  - env merge: caller `env` overrides survive `buildSpawnEnv()` merge; `DASHBOARD_STARTER` passes through.
  - readiness: health-ok → resolves with `reportedPid`; port-conflict → `PortConflictError`; child early-exit (exitCode set during poll) → `EarlyExitError`; timeout → `Error`.
  - POSIX + jiti loader: entry passed raw (not URL-wrapped). Windows + jiti: entry URL-wrapped. Pinned via `shouldUrlWrapEntry` behavior.
- [x] 2.5 `npm run build && npm test -w packages/shared` green. No call site touched yet.

## Phase B — migrate runtime sites (one at a time)

## 3.1 Extension

- [x] 3.1.1 Replace `resolveJitiImport()` + raw `["--import", loader, entry, ...args]` spawn in `packages/extension/src/server-launcher.ts` with `launchDashboardServer({ cliPath: entry, stdio: "ignore", healthTimeoutMs: 2_000, env: { DASHBOARD_STARTER: "Bridge", ... } })`. Remove the `ban:raw-node-import-ok` opt-out comment and the `resolveJitiImport` import.
- [x] 3.1.2 Update `packages/extension/src/__tests__/server-launcher.test.ts` to mock `launchDashboardServer` instead of `child_process.spawn`. Pin: `DASHBOARD_STARTER=Bridge` flows through, `stdio: "ignore"` selected, `healthTimeoutMs` matches.
- [x] 3.1.3 Smoke: deferred to `server-launch-smoke-suite` (script `bridge-smoke.sh`).

## 3.2 CLI

- [x] 3.2.1 In `packages/server/src/cli.ts cmdStart`: delete the `try { resolveJitiImport() } catch { … createRequire(cliPath).resolve("tsx") … }` block AND the inline `spawnNodeScript({ loader, entry, args, spawnOptions })` call. Replace with `await launchDashboardServer({ cliPath, extraArgs: args, stdio: { logFile }, healthTimeoutMs: 30_000, port: config.port, env: { ...process.env } })`. Keep the pre-spawn `isServerRunning(port)` short-circuit and the post-spawn `readPid()` reconciliation (use `result.reportedPid ?? readPid() ?? result.childPid` for the reported PID). Remove the `ban:raw-node-import-ok` opt-out and tsx-fallback log line.
- [x] 3.2.2 Update `packages/server/src/__tests__/cli-parse.test.ts` (or add a `cli-start.test.ts`) to mock `launchDashboardServer` and pin: `healthTimeoutMs: 30_000`, log-file path `~/.pi/dashboard/server.log`, no tsx code path reachable.
- [x] 3.2.3 Smoke: deferred to `server-launch-smoke-suite` (scripts `cli-cold-smoke.sh` + `cli-warm-smoke.sh`).

## 3.3 Electron

- [x] 3.3.1 In `packages/electron/src/lib/launch-source.ts spawnFromSource`: replace the `resolveJitiFromAnchor(source.cliPath) ?? resolveJitiImport()` chain + raw `spawn(... ["--import", ...])` with `await launchDashboardServer({ cliPath: source.cliPath, anchor: source.cliPath, stdio: { logFile: <existing electron log path> }, healthTimeoutMs: 15_000, port, env: { ...buildSpawnEnv(), DASHBOARD_STARTER: "Electron" } })`. Drop the `ban:raw-node-import-ok` opt-out.
- [x] 3.3.2 Update the `deps?.resolveJitiFromAnchor` injection seam: replace with `deps?.resolveJiti?: ToolResolver["resolveJiti"]` (or remove entirely if no test uses it). Update `packages/electron/src/lib/__tests__/launch-source.test.ts` accordingly.
- [x] 3.3.3 Smoke: deferred to `server-launch-smoke-suite` (script `electron-cold-smoke.sh`).

## 3.4 Electron legacy V1

- [x] 3.4.1 Audit: `git grep -nE "launchServer|resolveJitiFromPi" packages/electron/` and search for any caller of `launchServer` reachable when `LAUNCH_SOURCE_V2=false`. Decide one of:
  - **Option (a) — delete**: if `LAUNCH_SOURCE_V2` default-true (per `simplify-electron-bootstrap-derived-state` task 6.5) makes V1 unreachable in shipped code, delete `launchServer` and the local `resolveJitiFromPi` from `packages/electron/src/lib/server-lifecycle.ts`. Document in §6.4 audit log.
  - **Option (b) — migrate**: if any reachable caller remains, route through `launchDashboardServer({ … })`; explicitly drop the `tsx → jiti` fallback (this proposal owns the in-body tsx code in electron; only the cli.ts shebang stays for `replace-tsx-with-jiti`).
- [x] 3.4.2 Update / delete `packages/electron/src/lib/__tests__/server-lifecycle*.test.ts` per chosen option.
- [x] 3.4.3 Smoke: deferred to `server-launch-smoke-suite` (script `electron-v1-smoke.sh`).

## Phase C — restart-helper argv extraction

## 4. Restart helper

- [x] 4.1 Refactor `packages/server/src/restart-helper.ts buildOrchestratorScript` to call `buildNodeImportArgvParts({ loader: params.loader, entry: params.cliPath, args: ["start", ...params.extraArgs] })` (added in §2.3). Embed the resulting `string[]` into the `node -e` script as `JSON.stringify(parts)`. Remove the inline `toFileUrl` / `shouldUrlWrapEntry` block.
- [x] 4.2 Update `packages/server/src/__tests__/restart-helper.test.ts` (or equivalent) to pin the embedded argv shape and verify Windows + non-`C:` drive paths are URL-wrapped via `toFileUrl`.

## Phase D — lint tighten + deletions

## 5. Lint allow-list

- [x] 5.1 Tighten `packages/shared/src/__tests__/no-raw-node-import.test.ts`:
  - `ALLOWLIST = ["packages/shared/src/platform/node-spawn.ts", "packages/shared/src/server-launcher.ts"]` (drop `resolve-jiti.ts`).
  - `URL_LOOKING_RE`: drop `resolveJitiImport\s*\(` and `resolveJitiFromAnchor\s*\(` alternates.
  - Run lint; verify zero matches in `packages/{extension,server,electron}/src/`.
- [x] 5.2 `git grep -nE "ban:raw-node-import-ok" packages/{extension,server,electron}/src/` returns zero hits. Remove any stragglers.

## 6. Deletions

- [x] 6.1 Pre-deletion audit: `git grep -nE "ts-loader-resolver|resolveJitiImport|resolveJitiFromAnchor|resolveJitiFromPi|pickJitiRegisterUrl|pickJitiFromAnchor|buildJitiRegisterUrl" packages/` excluding `out/`, `dist/`, `node_modules/`. Verify zero remaining importers / non-test references.
- [x] 6.2 Delete `packages/shared/src/resolve-jiti.ts` and `packages/shared/src/__tests__/resolve-jiti.test.ts`.
- [x] 6.3 Update `packages/shared/package.json`: remove `"./resolve-jiti.js"` from `exports`. Run `npm pack --dry-run -w packages/shared` to confirm tarball shape.
- [x] 6.4 Delete `packages/electron/src/lib/ts-loader-resolver.ts` (no remaining importers per §6.1 audit).
- [x] 6.5 Remove `resolveJitiFromPi` export from `packages/electron/src/lib/server-lifecycle.ts`. If §3.4 chose option (a), the function is gone with `launchServer`; otherwise inline the body into `launchServer` as a private helper.
- [x] 6.6 Edit `AGENTS.md` directly (root file — Documentation Update Protocol delegation rule applies to `docs/`, not AGENTS.md): drop any `src/shared/resolve-jiti.ts` row; add a row for `packages/shared/src/server-launcher.ts`.

## Coordination & validation

## 7. Coordination

- [x] 7.1 Verify with `replace-tsx-with-jiti` ownership boundary: that change owns the `#!/usr/bin/env node --import tsx` shebang in `cli.ts` and the `tsx` devDependency removal; this change owns the in-body tsx fallback in `cmdStart` and the tsx branch in legacy electron `launchServer`. Cross-link both proposals.
- [x] 7.2 Add CHANGELOG entry under `## [Unreleased]` listing: removed exports (`resolveJitiImport`, `resolveJitiFromAnchor`, `pickJitiRegisterUrl`, `pickJitiFromAnchor`, `buildJitiRegisterUrl`, the `./resolve-jiti.js` subpath); new exports (`launchDashboardServer`, `JitiNotFoundError`, `PortConflictError`, `EarlyExitError`); migration note for downstream packagers importing from `@blackbelt-technology/pi-dashboard-shared/resolve-jiti.js`.

## 8. Validation

- [x] 8.1 `openspec validate unify-server-launch-ts-loader --strict` passes.
- [x] 8.2 Affected unit suites green: shared (resolveJiti, server-launcher, no-raw-node-import, node-spawn), extension (server-launcher), server (cli, restart-helper), electron (launch-source, server-lifecycle if migrated).
- [x] 8.3 Manual smoke per starter — deferred to `server-launch-smoke-suite` (covers Bridge / Standalone cold+warm / Electron / V1 / restart). Cross-linked from CHANGELOG. Ships separately so this change can be archived once unit suites + lint are green.
- [x] 8.4 Repo-lint: `no-raw-node-import` passes with the 2-entry allow-list. Zero `ban:raw-node-import-ok` markers anywhere under `packages/{extension,server,electron}/src/`.
