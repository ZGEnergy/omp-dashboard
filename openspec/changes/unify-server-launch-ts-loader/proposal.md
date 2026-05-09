## Why

The dashboard server is launched from **five** call sites that each rederive loader resolution, argv shape, env, stdio, log paths, and readiness policy:

1. `packages/extension/src/server-launcher.ts` — `resolveJitiImport()` + raw `["--import", loader, entry, …]` (carries `ban:raw-node-import-ok` opt-out).
2. `packages/server/src/cli.ts` (`cmdStart`) — `resolveJitiImport()` with **in-body tsx fallback** (`createRequire(cliPath).resolve("tsx")`); already delegates argv to `spawnNodeScript`. Readiness loop is `READINESS_TIMEOUT_MS = 30_000` with mid-poll `child.exitCode` check; logs to `~/.pi/dashboard/server.log` (append + timestamped header); reconciles `child.pid` against `readPid()` post-health-ok.
3. `packages/electron/src/lib/launch-source.ts` (`spawnFromSource`) — `resolveJitiFromAnchor(cliPath) ?? resolveJitiImport()` + raw argv (opt-out).
4. `packages/electron/src/lib/server-lifecycle.ts` (`launchServer`, legacy V1) — tsx → `resolveJitiFromPi()` fallback + raw argv (opt-out).
5. `packages/server/src/restart-helper.ts` (`buildOrchestratorScript`) — emits a `node -e` orchestrator string that itself constructs `["--import", toFileUrl(loader), entry, "start", …]`. Cannot directly call a runtime launcher (executes in a fresh Node process), but shares every concern below.

Jiti resolution is centralised in `packages/shared/src/resolve-jiti.ts` with the helpers `resolveJitiImport()` (argv-anchored), `resolveJitiFromAnchor(anchor)` (caller-anchored), the pure test seams `pickJitiRegisterUrl(resolver)` and `pickJitiFromAnchor(resolver, pathExists)`, plus `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]` (upstream-first, legacy fallback) supporting both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent`. Per its own docblock, one earlier electron duplication of `resolveJitiFromAnchor` was already collapsed in `consolidate-platform-handlers`. What remains is **two duplicate `resolveJitiFromPi()` wrappers** — `electron/server-lifecycle.ts:254` and `electron/ts-loader-resolver.ts:38` — both layering the same managed-pi → system-pi probe around the shared anchor resolver.

`packages/shared/src/platform/node-spawn.ts` already exports `spawnNodeScript`, `toFileUrl`, and `shouldUrlWrapEntry` — the canonical primitives. `cmdStart` uses `spawnNodeScript`; the other three runtime sites do not. The repo lint `no-raw-node-import` allow-lists `node-spawn.ts` + `resolve-jiti.ts` and tolerates three per-line `ban:raw-node-import-ok` markers at the holdouts.

Net effect: every spawn site re-derives node binary, env, loader URL-wrapping, entry URL-wrapping rule, log path, readiness policy, and identity-verification independently. Bugs surface site-by-site (most recent: `simplify-electron-bootstrap-derived-state` task 13.6 — packaged Electron's empty `process.argv[1]` broke `resolveJitiImport()`, fixed at one of the four runtime sites). Originally Phase 3 of the now-archived `electron-wizard-smart-detection`; carved out here because the superseder did not absorb it.

## What Changes

### Resolver consolidation
- Add `ToolResolver.resolveJiti({ anchor?, resolver? })` to `packages/shared/src/platform/binary-lookup.ts`. Resolution order: managed pi install — try each entry of `["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"]` under `~/.pi-dashboard/node_modules/<pi-pkg>/package.json` → system pi via `which("pi")` (uses ToolResolver's existing `which()`) → `opts.anchor` (caller-supplied path inside a `node_modules` tree) → `process.argv[1]`. For each anchor, walk `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]`. Returns the jiti register hook as a `file://` URL string (preserving the `buildJitiRegisterUrl` Windows drive-letter wrapping contract) or null. The optional `resolver?: JitiResolver` parameter carries the existing test-injection seam verbatim.

### Shared launcher (runtime)
- Add `packages/shared/src/server-launcher.ts` exporting `launchDashboardServer(opts)`. Owns:
  - **Loader resolution** via `ToolResolver.resolveJiti({ anchor })`; throws typed `JitiNotFoundError` on null.
  - **Argv construction** by delegating to `spawnNodeScript({ loader, entry: cliPath, args: extraArgs, ... })` from `node-spawn.ts`. The `shouldUrlWrapEntry(loader)` rule (POSIX + jiti → raw entry; Windows or tsx → URL-wrapped) is owned by `node-spawn.ts` and pinned by the new launcher's tests.
  - **Env** via `ToolResolver.buildSpawnEnv()` merged with caller-supplied overrides (e.g. `DASHBOARD_STARTER`).
  - **Stdio routing**: `"ignore"` (extension) or `{ logFile: string }` (caller-owned absolute path; launcher opens with `"a"`, writes a `[<ISO>] <starter> launch (parent pid <pid>, port <port>)\n` header line, closes parent fd after spawn).
  - **Readiness policy**: poll `isDashboardRunning(port)` from `packages/shared/src/server-identity.ts` until `running` is true OR `portConflict` is true (typed `PortConflictError`) OR `child.exitCode !== null` (typed `EarlyExitError` carrying exit code) OR `healthTimeoutMs` elapses. The poll must also surface `pid` from the health response so callers can reconcile against `child.pid` / `readPid()`.
  - **Return value**: `Promise<{ childPid: number; reportedPid: number | null; healthOk: boolean }>` — `reportedPid` is the value from `/api/health` (matches `readPid()` once the server has written its PID file), `childPid` is the spawned process pid (may differ on Windows or after re-exec).
- The launcher does **not** own log-path policy — caller passes the absolute path. Conventions: extension → `"ignore"`; cli.ts → `~/.pi/dashboard/server.log`; electron → its existing path. No change to existing on-disk locations.

### Migrate runtime sites
- `extension/server-launcher.ts` — replace `resolveJitiImport()` + raw spawn with `launchDashboardServer({ cliPath: entry, stdio: "ignore", healthTimeoutMs: 2_000 })`. Drop opt-out marker.
- `server/cli.ts cmdStart` — replace the try-jiti-except-tsx block AND remove the inline tsx fallback (the only tsx code in this proposal — see Coordination below); call `launchDashboardServer({ cliPath, stdio: { logFile: ~/.pi/dashboard/server.log }, healthTimeoutMs: 30_000 })`. Caller still owns the pre-spawn `isServerRunning(port)` short-circuit and post-spawn `readPid()` reconciliation. Drop the inline `spawnNodeScript` call (now inside the launcher) and the inline tsx-resolution try/catch.
- `electron/launch-source.ts spawnFromSource` — replace the `resolveJitiFromAnchor(source.cliPath) ?? resolveJitiImport()` chain + raw spawn with `launchDashboardServer({ cliPath: source.cliPath, anchor: source.cliPath, stdio: { logFile: <electron log path> }, healthTimeoutMs: 15_000, env: ToolResolver.buildSpawnEnv() with DASHBOARD_STARTER=Electron })`. Drop opt-out marker. Update the `deps?.resolveJitiFromAnchor` injection seam to inject the new `resolveJiti` (or remove if not exercised by any test).
- `electron/server-lifecycle.ts launchServer` — legacy V1 path (reachable only when `LAUNCH_SOURCE_V2=false`, default-on per `simplify-electron-bootstrap-derived-state` task 6.5). Audit imports: if no caller remains under V2-default, **delete the function and the `resolveJitiFromPi` it owns**; otherwise migrate to `launchDashboardServer` and drop the tsx branch (V1 had a `tsx → jiti` fallback — kill the tsx branch as part of this proposal).

### Migrate restart helper (argv-only)
- `server/restart-helper.ts buildOrchestratorScript` — keep the `node -e` orchestrator (it must run in a fresh process), but extract the argv-construction snippet (`["--import", toFileUrl(loader), entry, "start", ...]`) into a tiny exported helper in `node-spawn.ts` (e.g. `buildNodeImportArgvParts({ loader, entry, args })`) that both `spawnNodeScript` AND `restart-helper.ts` use. This eliminates the last copy of the `--import` argv shape outside `node-spawn.ts`.

### Lint tightening
- After every site is migrated, tighten `packages/shared/src/__tests__/no-raw-node-import.test.ts` allow-list to **exactly** `["packages/shared/src/platform/node-spawn.ts", "packages/shared/src/server-launcher.ts"]`. Remove `resolve-jiti.ts` (file deleted). Remove `resolveJitiImport(` / `resolveJitiFromAnchor(` from the URL-looking regex. Verify zero `ban:raw-node-import-ok` markers remain in `packages/{extension,server,electron}/src/`.

### Deletions
- `packages/shared/src/resolve-jiti.ts` and its tests (cases ported in §1.2). Update `packages/shared/package.json` `exports` map to remove the `./resolve-jiti.js` subpath.
- `packages/electron/src/lib/ts-loader-resolver.ts` (audit via `git grep ts-loader-resolver` first).
- `resolveJitiFromPi` export from `electron/server-lifecycle.ts`.

## Capabilities

### New Capabilities
- `server-launch`: Single shared spawn primitive (`launchDashboardServer`) for the dashboard server. Owns loader resolution, argv, env, stdio, log-header line, readiness policy (health-ok / port-conflict / early-exit / timeout), and dual PID reporting. Every starter (Bridge, Standalone, Electron) routes through it.

### Modified Capabilities
- `jiti-loader`: Resolution moves from `resolve-jiti.ts` + scattered electron wrappers into `ToolResolver.resolveJiti()`. Public callers shrink from six named exports (`resolveJitiImport`, `resolveJitiFromAnchor`, `pickJitiRegisterUrl`, `pickJitiFromAnchor`, plus two `resolveJitiFromPi` wrappers) to one method.

## Phasing

To bound risk on the hot path, ship strictly additive first, migrate one site at a time with smoke after each, then delete:

1. **Phase A — additive.** Add `ToolResolver.resolveJiti` (§1) and `launchDashboardServer` (§2). No call site touched. `resolve-jiti.ts` still in tree.
2. **Phase B — migrate runtime sites one at a time, in this order**:
   1. `extension/server-launcher.ts` (smallest blast radius — Bridge auto-spawn). Smoke: Bridge auto-spawn → `/api/health.starter === "Bridge"`.
   2. `server/cli.ts cmdStart` (and remove its inline tsx fallback). Smoke: `pi-dashboard start` → `/api/health.starter === "Standalone"`.
   3. `electron/launch-source.ts spawnFromSource`. Smoke: Electron cold-launch on every `LaunchSource` → `/api/health.starter === "Electron"`.
   4. `electron/server-lifecycle.ts launchServer` — migrate or delete per audit.
3. **Phase C — restart-helper argv extraction (§restart helper).** No behavior change.
4. **Phase D — lint tighten + deletions.** Only after every migration is verified green.

## Impact

- **Files (new)**:
  - `packages/shared/src/server-launcher.ts` — `launchDashboardServer`, `JitiNotFoundError`, `PortConflictError`, `EarlyExitError`.
- **Files (modified)**:
  - `packages/shared/src/platform/binary-lookup.ts` — add `resolveJiti({ anchor?, resolver? })`.
  - `packages/shared/src/platform/node-spawn.ts` — add `buildNodeImportArgvParts({ loader, entry, args })` shared with `restart-helper.ts`.
  - `packages/extension/src/server-launcher.ts` — delegate; drop opt-out comment.
  - `packages/server/src/cli.ts` — delegate; drop inline tsx fallback (in-body, not the shebang); drop opt-out comment.
  - `packages/electron/src/lib/launch-source.ts` — delegate; drop chain + opt-out; update test seam.
  - `packages/electron/src/lib/server-lifecycle.ts` — drop `resolveJitiFromPi`; migrate or delete `launchServer`.
  - `packages/server/src/restart-helper.ts` — call `buildNodeImportArgvParts` instead of inline argv.
  - `packages/shared/src/__tests__/no-raw-node-import.test.ts` — tighten allow-list and regex.
  - `packages/shared/package.json` — drop `exports["./resolve-jiti.js"]` subpath.
- **Files (deleted)**:
  - `packages/shared/src/resolve-jiti.ts` and `packages/shared/src/__tests__/resolve-jiti.test.ts`.
  - `packages/electron/src/lib/ts-loader-resolver.ts`.
- **AGENTS.md**: update directly (not via subagent — `docs/` rule does not apply to root). Drop `src/shared/resolve-jiti.ts` row if present; add `packages/shared/src/server-launcher.ts` row.
- **Coordination with `replace-tsx-with-jiti`**: that change owns (a) the `#!/usr/bin/env node --import tsx` shebang in `cli.ts` and (b) the `tsx` devDependency removal. **This** change owns (a) the in-body tsx fallback inside `cmdStart` and (b) the tsx → jiti fallback inside the legacy electron `launchServer`. Either order works; both touch disjoint tsx code.
- **Risk**: Medium. Server spawn is on the hot path for every starter. Mitigated by phasing (above), unit tests over `resolveJiti` ported from `resolve-jiti.test.ts`, and integration smoke per starter after each migration. Real-world readiness numbers (30 s for cli, 15 s for electron, 2 s for extension) preserved verbatim — no timeout shrink as part of this change.
- **No protocol or user-facing changes.**
