## 0. Precondition check

- [ ] 0.1 Verify `merge-windows-integration-linear` landed on `develop`.
- [ ] 0.2 Verify `bootstrap-resolution-harness` landed. Confirm scenario B1 snapshot exists and matches current (broken) Windows behavior.
- [ ] 0.3 Reproduce the Windows `npm i -g pi-dashboard` bug per `design.md §2`. If fixed by another change, reduce this proposal's scope — see proposal header and coordinate with harness task 20.1.
- [ ] 0.4 Answer open item `design.md §16.1`: extension packaging decision (runtime dep vs meta-package vs sibling lookup). Record in ADR or design.md addendum before task 2.
- [ ] 0.5 Answer open item `design.md §16.4`: `piCompatibility` range. Read current pi-coding-agent version used in dev and by active users.

## 1. Shared installer module

- [ ] 1.1 Move `packages/electron/src/lib/dependency-installer.ts` → `packages/shared/src/bootstrap-install.ts`. Preserve the public interface (`runInstall`, `InstallProgress`, `ProgressCallback`).
- [ ] 1.2 Export `bootstrapInstall({ packages, managedDir, progress, subprocess }): Promise<InstallResult>` as the single entry point. Default `managedDir` = `getManagedDir()`.
- [ ] 1.3 Replace the Electron-only `detectSystemNode` import with `ToolRegistry.resolve("node")` — use the registry uniformly.
- [ ] 1.4 Add back-compat re-export in `packages/electron/src/lib/dependency-installer.ts`: `export { bootstrapInstall as runInstall } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js"`.
- [ ] 1.5 Update Electron wizard (`wizard-ipc.ts`) to call `bootstrapInstall` from shared. Confirm existing wizard tests pass.

## 2. Extension packaging

- [ ] 2.1 Per §16.1 decision: update `packages/server/package.json` `dependencies` to include `@blackbelt-technology/pi-dashboard-extension` (recommended), OR publish a meta-package, OR add sibling-path lookup to `findBundledExtension`.
- [ ] 2.2 Update `packages/shared/src/bridge-register.ts` `findBundledExtension` to additionally check `require.resolve("@blackbelt-technology/pi-dashboard-extension/package.json")` and use its dirname.
- [ ] 2.3 Add bootstrap-harness scenario for "pi-dashboard installed via npm-g, extension resolves via node_modules lookup". This is a NEW cell added to the cube; update `SKIPPED_SCENARIOS` if needed.
- [ ] 2.4 Smoke: `npm pack` the server package, install into a scratch dir, confirm `find node_modules -name 'packages/extension' -o -name '@blackbelt-technology/pi-dashboard-extension'` locates the extension.

## 3. Bootstrap state in server

- [ ] 3.1 Create `packages/server/src/bootstrap-state.ts` with `BootstrapState { status, progress, error, version }` + in-memory singleton + listener hooks.
- [ ] 3.2 Create `packages/server/src/routes/bootstrap-routes.ts` exposing:
  - `GET /api/bootstrap/status`
  - `POST /api/bootstrap/upgrade-pi`
  - `POST /api/bootstrap/retry`
- [ ] 3.3 Wire `bootstrap_status_update` broadcast on every state change via the browser gateway.
- [ ] 3.4 Add type to `packages/shared/src/browser-protocol.ts` `ServerToBrowserMessage` union.
- [ ] 3.5 Write route tests for each endpoint (happy path + failure cases).

## 4. Degraded-mode startup in CLI

- [ ] 4.1 In `packages/server/src/cli.ts`: after server starts listening, call `ToolRegistry.resolve("pi")`.
- [ ] 4.2 If `ok: false`, set `bootstrapState.status = "installing"`, invoke `bootstrapInstall()` async, don't await.
- [ ] 4.3 On bootstrap completion, re-resolve pi. If now resolved: call `registerBridgeExtension(findBundledExtension())`, set status = "ready", broadcast.
- [ ] 4.4 On bootstrap failure: set status = "failed" with error details, broadcast.
- [ ] 4.5 Add structured log lines at each transition: `[bootstrap] installing`, `[bootstrap] ready (pi@0.6.3, openspec@0.4.1)`, `[bootstrap] failed: <error>`.

## 5. Gating pi-dependent endpoints

- [ ] 5.1 Session spawn: add `if (bootstrapState.status === "installing") return queueRequest(req);` with a ticket mechanism. On status change to "ready", flush queue.
- [ ] 5.2 Terminal spawn: if the shell command resolves to pi (check via ToolRegistry), return 503 with actionable message when status !== "ready".
- [ ] 5.3 Flow launch: same queue pattern as session spawn.
- [ ] 5.4 pi-resource scan: return `{ extensions: [], skills: [], prompts: [], bootstrap: bootstrapState }`.
- [ ] 5.5 `/api/pi-core/*`: return 503 when status !== "ready".

## 6. Client UI — bootstrap banner

- [ ] 6.1 Create `packages/client/src/hooks/useBootstrapStatus.ts` — fetches + subscribes to `bootstrap_status_update` broadcasts.
- [ ] 6.2 Create `packages/client/src/components/BootstrapBanner.tsx`:
  - hidden when status = "ready"
  - "Installing pi — sessions will be available shortly" with spinner + progress bar when status = "installing"
  - "Install failed — [Retry] [View logs]" when status = "failed"
- [ ] 6.3 Mount in `App.tsx` above the main layout.
- [ ] 6.4 Test: simulate status changes via Storybook/fixture state.

## 7. Upgrade-pi UI

- [ ] 7.1 In `PiCoreVersionsSection.tsx`, add a row for `@mariozechner/pi-coding-agent` sourced from `bootstrapState.version.pi`.
- [ ] 7.2 Add "Update" button wired to `POST /api/bootstrap/upgrade-pi`.
- [ ] 7.3 Progress display reuses the `bootstrap_status_update` broadcast (no new WS types).
- [ ] 7.4 On completion, trigger existing `reload_all` broadcast (same pattern as pi-core updates).

## 8. Upgrade-pi CLI subcommand

- [ ] 8.1 Add `upgrade-pi` to `SUBCOMMANDS` in `packages/server/src/cli.ts`.
- [ ] 8.2 Implement handler:
  - If dashboard running (via `isDashboardRunning()`): POST to `/api/bootstrap/upgrade-pi`, stream progress via WS client, exit when done.
  - If no dashboard: run `bootstrapInstall({ packages: ["@mariozechner/pi-coding-agent"], mode: "upgrade" })` directly, stream to stdout, exit.
- [ ] 8.3 Add streaming progress formatter (simple ANSI progress bar, fallback to plain text if not TTY).
- [ ] 8.4 Unit tests for argument parsing + dispatch; integration test for end-to-end upgrade flow.

## 9. Version-skew detection

- [ ] 9.1 Read `piCompatibility` field from `packages/server/package.json` at startup. Initial values: `{ minimum: "0.5.0", recommended: "0.6.0", maximum: "0.9.x" }` (adjust per task 0.5).
- [ ] 9.2 On pi resolution, read version from `<resolved>/../package.json`. Cache for 60s.
- [ ] 9.3 Compare: if < minimum → set `bootstrapState.error = "Version too old"` and block pi-dependent ops. If < recommended → add `upgradeRecommended: true` to status. If > maximum → add `upgradeDashboard: true`.
- [ ] 9.4 Expose via GET /api/bootstrap/status.
- [ ] 9.5 UI: show hint in banner when `upgradeRecommended === true`.

## 10. Bridge re-registration after bootstrap

- [ ] 10.1 After successful bootstrap, call `registerBridgeExtension(findBundledExtension())` within the same async flow.
- [ ] 10.2 Update harness scenario B3 (or a new B4): "pi installed by bootstrap → bridge auto-registered" — confirm expected behavior via snapshot.
- [ ] 10.3 If registration fails (e.g., malformed settings.json), log but don't fail the bootstrap — the user can re-register manually.

## 11. Harness snapshot updates (handoff from proposal 1)

- [ ] 11.1 Update scenario B1 expected outcome: "unresolved" → "resolves via managed after bootstrap". Update snapshot.
- [ ] 11.2 Add scenario B4 (or rename): "npm-g + pi absent → bootstrap runs → all resolve via managed + bridge auto-registered".
- [ ] 11.3 Document the snapshot change in the PR description so reviewers understand why.

## 12. Integration tests

- [ ] 12.1 Extend `packages/electron/scripts/test-electron-install.sh` with a new variant: "npm-g layout, no pi". Simulate `npm i -g` install layout, run pi-dashboard, assert:
  - `/api/health` returns OK
  - `/api/bootstrap/status` reports "installing"
  - After ~30s, status becomes "ready"
  - `ToolRegistry.resolve("pi")` returns managed path
- [ ] 12.2 Add similar test for Windows (may need QA VM variant in `qa/tests/`).

## 13. Lock file coordination

- [ ] 13.1 If proposal `single-dashboard-per-home` has landed: wire `bootstrapInstall` inside the acquired lock. If not: document as known race and defer.
- [ ] 13.2 Add harness scenario: "two simultaneous bootstraps" (skipped with reason "requires lock from single-dashboard-per-home").

## 14. Cleanup + documentation

- [ ] 14.1 Remove `packages/electron/src/lib/dependency-installer.ts` if back-compat re-export is no longer needed. Otherwise keep thin re-export with deprecation comment.
- [ ] 14.2 Update `AGENTS.md` key-files table: `bootstrap-install.ts` (new), `bootstrap-state.ts` (new), `bootstrap-routes.ts` (new), `BootstrapBanner.tsx` (new).
- [ ] 14.3 Update `docs/architecture.md` with a new section "Bootstrap & First Run" covering all three install paths.
- [ ] 14.4 Add CHANGELOG entry: "feat: auto-install pi on first `pi-dashboard` run (degraded mode during install, UI banner, CLI `upgrade-pi` subcommand)."

## 15. Validation gates

- [ ] 15.1 All bootstrap-harness scenarios green (including updated B1).
- [ ] 15.2 All existing dashboard tests green.
- [ ] 15.3 Manual Windows smoke: fresh VM + `npm i -g @blackbelt-technology/pi-agent-dashboard` → `pi-dashboard` → confirm degraded-mode banner → wait for ready → spawn session → succeeds.
- [ ] 15.4 Manual "user already has pi globally" smoke: confirm no shadow install, status goes straight to "ready".
- [ ] 15.5 Manual upgrade-pi: both UI button and `pi-dashboard upgrade-pi` subcommand work; sessions auto-reload.
