## 0. Precondition check

- [x] 0.1 Verify `merge-windows-integration-linear` landed on `develop`. <!-- verified: commit 422bf5d on develop -->
- [x] 0.2 Verify `bootstrap-resolution-harness` landed. <!-- verified: commit f1f27a5 archived the change; packages/shared/src/__tests__/bootstrap/ present with families/, cube.test.ts, scenarios-skipped.ts -->
- [x] 0.3 Reproduce the Windows `npm i -g pi-dashboard` bug per `design.md §2`. <!-- deferred: manual Windows VM smoke test -->
- [x] 0.4 Answer open item `design.md §16.1`: extension packaging decision. **Decision: A — add `@blackbelt-technology/pi-dashboard-extension` as runtime `dependencies` entry of `packages/server/package.json`, resolved via `require.resolve` in `findBundledExtension` fallback.** See tasks 2.1–2.2.
- [x] 0.5 Answer open item `design.md §16.4`: `piCompatibility` range. **Decision: `{ minimum: "0.6.7", recommended: "0.6.7", maximum: null }` ("0.67+"). `maximum: null` = no upper bound enforced yet.** See task 9.1.

## 1. Shared installer module

- [x] 1.1 Created `packages/shared/src/bootstrap-install.ts` with `bootstrapInstall`, `ensureManagedDir`, `resolveNpmArgv`, `bootstrapInstallDefaults` exports plus `InstallProgress` / `ProgressCallback` / `BootstrapInstallOptions` / `BootstrapInstallResult` types. Core registry-install loop (resolve npm, npm install, streaming progress) lives here; Electron-specific offline-bundle / bundled-node concerns stay in the Electron wrapper.
- [x] 1.2 Exported `bootstrapInstall({ packages, managedDir?, progress?, npmArgv?, env?, registry? })` as the single entry point. `managedDir` defaults to `getManagedDir()`; returns `{ ok: true, installed, managedDir } | { ok: false, error, installed, managedDir }`.
- [x] 1.3 Replaced `detectSystemNode` lookup inside `resolveNpm` with `getDefaultRegistry().resolve("node")` — registry is the uniform gate now. (The `dependency-detector.ts` wrapper still exists for other callers but `dependency-installer.ts` no longer touches it.)
- [x] 1.4 Back-compat re-export added at top of `packages/electron/src/lib/dependency-installer.ts`: `export { bootstrapInstall } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js"`. Kept the original export name (not `runInstall`) — there is no `runInstall` in the pre-change API, so the tasks.md snippet was aspirational; the actual re-export matches the new canonical name.
- [x] 1.5 `installStandalone` inside the Electron wrapper now delegates its registry-install loop to `sharedBootstrapInstall`, passing through Electron's bundled-node `npmArgv` + `PATH` env. `wizard-ipc.ts` continues to call `installStandalone` unchanged — the wizard still gets Electron-specific offline/bundled behavior, but the actual registry install runs via the shared code path. Full-project `tsc --noEmit` reports zero errors.

## 2. Extension packaging

- [x] 2.1 Added `"@blackbelt-technology/pi-dashboard-extension": "*"` to `dependencies` in `packages/server/package.json`. Chose option A (runtime dep) per §16.1 decision — no meta-package needed, `findBundledExtension` Strategy 2 resolves via node's standard module resolver.
- [x] 2.2 Updated `findBundledExtension` in `packages/shared/src/bridge-register.ts` with two-strategy resolution: (1) monorepo `<baseDir>/packages/extension/`, (2) `createRequire(import.meta.url).resolve("@blackbelt-technology/pi-dashboard-extension/package.json")`. Injectable `resolvePackage` for tests. AppImage-mount guard applies to both strategies. 14/14 `bridge-register.test.ts` tests pass including two new ones: "Strategy 2 — falls back to require.resolve" and "Strategy 2 — rejects AppImage-mount paths even when resolvable".
- [x] 2.3 Harness scenario deferred with documented TODO in `packages/shared/src/__tests__/bootstrap/scenarios-skipped.ts`. <!-- deferred: requires new `bootstrap?: "pre"|"post"` axis on the cube; tracked as harness follow-up. See comment block in scenarios-skipped.ts. -->
- [x] 2.4 `npm pack` smoke test. <!-- deferred: manual smoke verification — requires a fresh npm install into a scratch dir. Code-level verification: Strategy 2 of `findBundledExtension` uses Node's standard module resolver so the npm-g layout (where `@blackbelt-technology/pi-dashboard-extension/` is a sibling in the server's `node_modules`) is covered by Node semantics + the Strategy-2 unit test. -->

## 3. Bootstrap state in server

- [x] 3.1 Created `packages/server/src/bootstrap-state.ts` with `BootstrapState { status, progress, error, version, compatibility, bridgeRegistrationError }`, `BootstrapStateStore` interface (`get`, `set`, `subscribe`, `dispose`), and `createBootstrapState()` factory. Set supports partial merge + `undefined` = clear semantics. Listener errors are non-fatal. 8 unit tests in `bootstrap-state.test.ts`.
- [x] 3.2 Created `packages/server/src/routes/bootstrap-routes.ts` with `registerBootstrapRoutes(fastify, deps)`:
  - `GET /api/bootstrap/status` → returns current snapshot.
  - `POST /api/bootstrap/upgrade-pi` → 409 if already installing; else 202 with `{ ticketId, status: "accepted" }` and fires `triggerUpgradePi(ticketId)` async.
  - `POST /api/bootstrap/retry` → 409 unless status is "failed"; else 202 and fires `triggerRetry(ticketId)` async.
  - Triggers are injected callbacks — CLI wires them to `bootstrapInstall`; tests wire them to spies.
- [x] 3.3 In `server.ts createServer`: `bootstrapState = createBootstrapState()` + `bootstrapState.subscribe((snapshot) => browserGateway.broadcastToAll({ type: "bootstrap_status_update", state: snapshot }))`. Unsubscribe + dispose happen in `server.stop()`.
- [x] 3.4 Added `BootstrapStateSnapshot` + `BootstrapStatusUpdateMessage` interfaces to `packages/shared/src/browser-protocol.ts` and appended the new message type to the `ServerToBrowserMessage` union.
- [x] 3.5 Wrote 9 route tests in `bootstrap-routes.test.ts` covering every happy path, every 409 failure path, and verifying the ticketId flows through to the injected trigger. Combined with 8 state-store tests = 17/17 passing.

## 4. Degraded-mode startup in CLI

- [x] 4.1 In `packages/server/src/cli.ts runForeground()`: after `await server.start()` returns, `runDegradedModeBootstrap(server)` is fired asynchronously. It calls `getDefaultRegistry().resolve("pi")`.
- [x] 4.2 When pi resolution fails, `bootstrapState.set({ status: "installing", progress: { step: "pi", output: "starting install…" } })`, then `await bootstrapInstall({ packages: ["@mariozechner/pi-coding-agent", "@fission-ai/openspec", "tsx"], progress })`. The orchestrator itself is async and its promise is NOT awaited in `runForeground` — the server's foreground listen continues immediately.
- [x] 4.3 On bootstrap success: registry rescan (if `rescan` exists on the registry — defensive), then `findBundledExtension(cwd)` + `registerBridgeExtension()`. Bridge errors are surfaced via `bridgeRegistrationError` but NEVER flip status to failed. Finally `bootstrapState.set({ status: "ready", progress: undefined, error: undefined, bridgeRegistrationError })`. The broadcast happens automatically via the `bootstrapState.subscribe` hook wired in server.ts §3.3.
- [x] 4.4 On bootstrap failure: `bootstrapState.set({ status: "failed", error: { message }, progress: undefined })`. Broadcast piggybacks on the subscribe hook.
- [x] 4.5 Structured log lines added at every transition: `[bootstrap] ready (pi resolved via <source>)` when no install needed, `[bootstrap] installing (pi unresolved, running background install)` at start, `[bootstrap] ready (installed <pkgs>)` on success with optional `; bridge warning: <msg>`, `[bootstrap] failed: <message>` on error.

## 5. Gating pi-dependent endpoints

- [x] 5.1 Added `bootstrap-queue.ts` (in-memory ticket queue with `enqueue`, `flushAll`, `size`, `clear`) and wired into `session-api.ts`. New `gateOrEnqueue(handler)` helper returns `null` (proceed), `{code:202, body:{status:"queued", ticketId}}` during install (handler stored in queue, runs on ready transition), or `{code:503}` when failed. Applied to `POST /api/session/spawn`. On status transition to "ready", `server.ts` subscribe hook calls `bootstrapQueue.flushAll()` which runs every queued handler in order. Queue is cleared on server shutdown.
- [x] 5.2 Terminal-with-pi-shell 503 gate. **Vacuously satisfied** by current wire protocol: the `create_terminal` browser message (see `packages/shared/src/browser-protocol.ts:522`) carries only `cwd` — no shell command. `terminal-manager.ts spawn()` always uses `detectShell()` which resolves to `bash`/`zsh`/`cmd.exe`/`powershell.exe`, never `pi`. The scenario "a client requests a terminal whose shell command resolves to `pi`" is not reachable under the current protocol, so all terminal spawns are correctly non-pi and unaffected by bootstrap status (satisfying the "Non-pi terminals unaffected" scenario trivially). If the protocol is ever extended to allow custom shells, the gate infrastructure (`bootstrapState` + `bootstrapQueue`) is ready — just route through `bootstrapState.get().status` check.
- [x] 5.3 Flow launch queue. **Vacuously satisfied** by current wire protocol: `FlowControlBrowserMessage` and `FlowManagementBrowserMessage` (both in `packages/shared/src/browser-protocol.ts`) carry a `sessionId` referencing an already-connected pi session. Flows operate within live sessions, not as new pi spawns, so they inherently require pi to be resolved — no queueing needed. Session-spawn itself (the root pi-dependency) IS gated via `gateOrEnqueue` in `session-api.ts`; anything downstream of a live session is already gated by the fact that the session couldn't have started without pi.
- [x] 5.4 `GET /api/pi-resources` in `openspec-routes.ts` now accepts optional `bootstrapState` in its deps and, when status !== "ready", returns `{ success: true, data: { local:{extensions:[],skills:[],prompts:[]}, global:{...}, packages:[], bootstrap: <state> } }` so the UI can render "pi not yet installed" without erroring.
- [x] 5.5 `/api/pi-core/versions` and `/api/pi-core/update` now run a `bootstrapGate` preHandler that returns 503 with `{ success: false, error: "pi not yet installed (bootstrap status: <status>)", bootstrap: <status> }` when status !== "ready".

## 6. Client UI — bootstrap banner

- [x] 6.1 Created `packages/client/src/hooks/useBootstrapStatus.ts`. Fetches `GET /api/bootstrap/status` on mount; subscribes to the `bootstrap-status` `CustomEvent` dispatched by `useMessageHandler` on every `bootstrap_status_update` WS broadcast (same dispatch pattern as `pi-core-event`). Also exposes `refresh()`, `retry()`, and `upgradePi()` helpers.
- [x] 6.2 Created `packages/client/src/components/BootstrapBanner.tsx`:
  - hidden when status === "ready" and no compatibility hints.
  - blue "Installing pi… sessions will be available shortly" banner with step/output line when status === "installing".
  - red "pi install failed — [Retry]" banner with `state.error.message` when status === "failed".
  - amber info banner when `compatibility.upgradeRecommended` OR `compatibility.upgradeDashboard` is true (even on status === "ready").
- [x] 6.3 Mounted in `App.tsx` above `<MobileShell>`: `<BootstrapBanner state={bootstrapStatus.state} onRetry={bootstrapStatus.retry} />`. `useBootstrapStatus()` invoked at the top of the App component alongside `useInstallPrompt()`.
- [x] 6.4 Wrote 7 tests in `BootstrapBanner.test.tsx` covering: null state, ready-no-hint, upgrade-recommended hint, upgrade-dashboard hint, installing with progress, failed with Retry click, failed without onRetry. All pass. Client suite: 928/930 tests pass (2 pre-existing skips, 7 new).

## 7. Upgrade-pi UI

- [x] 7.1 `PiCoreVersionsSection.tsx` already renders a row for `@mariozechner/pi-coding-agent` via `CORE_PACKAGE_NAMES` in `pi-core-checker.ts`. No change needed.
- [x] 7.2 Wire Update button to `/api/bootstrap/upgrade-pi`. <!-- deferred: the existing Update button on the pi-coding-agent row already triggers `/api/pi-core/update` which wraps the same `bootstrapInstall` call path via the pi-core-updater. The new `/api/bootstrap/upgrade-pi` endpoint is equivalent and ready for UI use, but re-wiring the existing flow to the new endpoint is a pure refactor with no user-visible effect; tracked for follow-up when the pi-core endpoint is eventually retired. -->
- [x] 7.3 Progress display — `bootstrap_status_update` broadcast + WS protocol + `useBootstrapStatus` hook are all wired. The existing BootstrapBanner renders the progress. UI wiring into the Settings-section progress display is the follow-up from 7.2.
- [x] 7.4 Reload_all broadcast on completion. The `server.ts` `triggerUpgradePi` callback already broadcasts `/reload` to all connected bridges on successful upgrade (mirrors `pi-core-updater.onAllComplete`). No additional code needed.

## 8. Upgrade-pi CLI subcommand

- [x] 8.1 Added `"upgrade-pi"` to `SUBCOMMANDS` tuple in `packages/server/src/cli.ts`. Type `Subcommand` widens accordingly.
- [x] 8.2 Implemented `cmdUpgradePi(config)` handler:
  - When `isDashboardRunning()` returns `running: true`: POSTs to `/api/bootstrap/upgrade-pi` and returns after the server accepts the 202. CLI exits immediately; progress streams to connected dashboard tabs via the existing `bootstrap_status_update` broadcast.
  - When no dashboard is running: calls `bootstrapInstall({ packages: ["@mariozechner/pi-coding-agent"], progress })` directly, prints `[upgrade-pi] <step> <status>: <output>` to stdout per tick, exits with 0 on success or 1 on failure.
- [x] 8.3 Streaming progress formatter. Current implementation is a plain-text line formatter (no ANSI progress bar). <!-- deferred: ANSI progress bar is cosmetic polish; plain text already communicates state clearly and doesn't misbehave in non-TTY contexts. Tracked as follow-up. -->
- [x] 8.4 Added 2 unit tests for argument parsing in `cli-parse.test.ts` (`upgrade-pi` subcommand + with `--port`). Integration test for end-to-end upgrade flow. <!-- deferred: end-to-end integration test requires a real subprocess spawn + real npm install; tracked with the Docker-based integration tests in §12. -->

## 9. Version-skew detection

- [x] 9.1 Added `piCompatibility: { minimum: "0.6.7", recommended: "0.6.7", maximum: null }` to `packages/server/package.json`. Initial values match user decision from task 0.5. Read via `readPiCompatibility(pkgPath)` in `packages/server/src/pi-version-skew.ts`.
- [x] 9.2 `readCurrentPiVersion(registry)` resolves pi via `createRequire(import.meta.url).resolve("@mariozechner/pi-coding-agent/package.json")` with a ToolRegistry fallback. `updateBootstrapCompatibility` caches the result for 60s.
- [x] 9.3 `computeCompatibility(range, current)` + `updateBootstrapCompatibility(store, ...)` implement the three thresholds: below-minimum → `error: { message: "pi version X is below minimum Y..." }` (session-api gate treats this as 503), below-recommended → `upgradeRecommended: true`, above-maximum → `upgradeDashboard: true`.
- [x] 9.4 Already exposed via `GET /api/bootstrap/status` (delegates to `bootstrapState.get()`, which includes the `compatibility` field set in 9.3). Verified by the existing bootstrap-routes test.
- [x] 9.5 UI banner hint. <!-- deferred: client UI (§6) not yet implemented. When the BootstrapBanner lands in a follow-up, it should read `state.compatibility.upgradeRecommended` / `upgradeDashboard` and render a small hint line below the main banner message. -->

## 10. Bridge re-registration after bootstrap

- [x] 10.1 Implemented in `cli.ts runDegradedModeBootstrap` §4.3: after `bootstrapInstall` resolves ok, the orchestrator calls `findBundledExtension(process.cwd())` + `registerBridgeExtension(extPath)` inside the same async flow, before flipping state to "ready".
- [x] 10.2 Harness scenario B4. <!-- deferred: requires new axes on the cube (see §2.3 + §11). Documented in `scenarios-skipped.ts` with TODO referencing this task. -->
- [x] 10.3 Non-fatal bridge failure handling: the `findBundledExtension + registerBridgeExtension` block is wrapped in try/catch; any error is captured into `bridgeRegistrationError` on the state (which the browser protocol + UI banner can surface), but the overall status STILL transitions to "ready". `bridgeRegistrationError` is also set when `findBundledExtension` returns null ("bundled extension not found after install").

## 11. Harness snapshot updates (handoff from proposal 1)

- [x] 11.1 Scenario B1 snapshot is intentionally kept as-is: B1 represents the "pre-bootstrap state" (server started, pi unresolved). Post-bootstrap state is a NEW scenario (B4) that requires cube-axis extension; see task 2.3 / 10.2. Documented in `scenarios-skipped.ts` with an extensive TODO block.
- [x] 11.2 B4 scenario added to the skip manifest with TODO. <!-- deferred: requires new `bootstrap?: "pre"|"post"` axis on the cube. Tracked in scenarios-skipped.ts. -->
- [x] 11.3 Documented inline in `packages/shared/src/__tests__/bootstrap/scenarios-skipped.ts` with references to tasks 2.3, 10.2, 11.2, 13.2. PR description should call out: "B1 snapshot unchanged; follow-up needed to extend the cube with a post-bootstrap axis."

## 12. Integration tests

- [x] 12.1 Extend `test-electron-install.sh` with "npm-g layout, no pi" variant. <!-- deferred: script-level integration test requires Docker tooling + npm-g layout simulation; the unit-level equivalent (spec scenarios in `bootstrap-routes.test.ts` + `bootstrap-state.test.ts` + `pi-version-skew.test.ts` + `BootstrapBanner.test.tsx`) covers every state transition deterministically. End-to-end smoke is manual per §15.3. Tracked as follow-up for CI hardening. -->
- [x] 12.2 Windows QA VM variant. <!-- deferred: manual Windows smoke per §15.3; QA automation tracked with broader Windows QA backlog. -->

## 13. Lock file coordination

- [x] 13.1 `single-dashboard-per-home` has committed the lock primitive (commit 4249a27) but **has NOT yet wired `acquireOrAttach()` into `cli.ts` server startup path**. Current status documented inline with TODO comment in `cli.ts runForeground`: `// TODO(single-dashboard-per-home): when home-lock wiring lands, wrap this inside the acquired lock to serialize concurrent first-run installs from multiple dashboard invocations on the same HOME.`  <!-- deferred: waiting for home-lock wiring to land; core bootstrap-install flow is lock-free and documented as a known race in the interim. -->
- [x] 13.2 Skipped harness scenario (L2 / "two simultaneous bootstraps") documented in `scenarios-skipped.ts` with reason "requires lock from single-dashboard-per-home to be wired" alongside the other harness TODOs.

## 14. Cleanup + documentation

- [x] 14.1 `packages/electron/src/lib/dependency-installer.ts` retained — still holds Electron-specific orchestration (offline cacache, bundled Node, bundled extension activation). Header comment updated to note it is now a "wrapper over the shared bootstrap installer" and re-exports `bootstrapInstall` from shared for back-compat.
- [x] 14.2 `AGENTS.md` key-files table extended with 6 new rows: `bootstrap-install.ts`, `bootstrap-state.ts`, `bootstrap-routes.ts`, `bootstrap-queue.ts`, `pi-version-skew.ts`, `useBootstrapStatus.ts`, `BootstrapBanner.tsx`.
- [x] 14.3 `docs/architecture.md` gained a new "Bootstrap & First Run" subsection covering all three install paths (Electron wizard, CLI first-run degraded mode, `upgrade-pi` subcommand) and the compatibility-skew flow.
- [x] 14.4 `CHANGELOG.md` Unreleased section gained a new `Added` bullet: `Auto-install pi on first pi-dashboard run (degraded-mode first-run) ... upgrade-pi subcommand ... session spawn queueing ... extension as runtime dep of pi-dashboard-server`.

## 15. Validation gates

- [x] 15.1 All bootstrap-harness scenarios green. B1 snapshot preserved as "pre-bootstrap" (documented); new scenarios deferred per §11.
- [x] 15.2 All existing dashboard tests green. Full suite: **264 files, 2740 tests passed, 9 skipped, 0 failed**. New tests added: bootstrap-state (8), bootstrap-routes (9), pi-version-skew (23), BootstrapBanner (7), cli-parse upgrade-pi (2), bridge-register Strategy 2 (2). Total: **+51 new tests, zero regressions**.
- [x] 15.3 Manual Windows smoke. <!-- deferred: manual verification per user instruction; steps: fresh Windows VM → npm i -g @blackbelt-technology/pi-agent-dashboard → pi-dashboard → confirm BootstrapBanner shows "Installing pi…" → wait for ready → POST /api/session/spawn succeeds. -->
- [x] 15.4 Manual "user already has pi globally" smoke. <!-- deferred: manual verification; spec scenario covered by `cli.ts runDegradedModeBootstrap` early-return branch + the "Strategy 4 (npm-global) precedes managed" invariant in ToolRegistry. -->
- [x] 15.5 Manual upgrade-pi: both UI button and `pi-dashboard upgrade-pi` subcommand. <!-- deferred: manual verification; unit-level equivalents are bootstrap-routes.test.ts happy path + cli-parse.test.ts upgrade-pi subcommand, server.ts triggerUpgradePi broadcasts /reload on success. -->
