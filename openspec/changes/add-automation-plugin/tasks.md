# Tasks — add-automation-plugin

## 1. Package scaffold
- [ ] 1.1 Create `packages/automation-plugin/` mirroring `flows-plugin` layout (`package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `src/{client,server,bridge}/index`).
- [ ] 1.2 Add `pi-dashboard-plugin` manifest: id `automation`, entrypoints, empty `claims[]` (filled in §5). → verify: `manifest-discoverability.test.ts` passes.
- [ ] 1.3 Wire package into workspace + plugin loader discovery. → verify: appears in `/api/health.plugins[]`.

## 2. Core touch (minimal)
- [ ] 2.1 Add `kind?: "automation"` + `automationRun?: { name; runId }` to `DashboardSession` (`packages/shared/src/types.ts`). → verify: type compiles; `.meta.json` persists.
- [ ] 2.2 Stamp `kind` from `PI_DASHBOARD_AUTOMATION_RUN` env in the spawn/event-wiring path. → verify: spawned run session carries `kind==="automation"`.
- [ ] 2.3 Board filter honors effective visibility (`kind==="automation"` hidden unless `visibility: shown`) in order manager (server) + board filter (client). → verify: hidden run absent from board, shown run present, always present to plugin queries.
- [ ] 2.4 Expose a spawn hook on `ServerPluginContext` (gated to first-party/trusted plugins). → verify: plugin server entry can spawn a session.

## 3. Folder format + store (capability: automation-folder-format)
- [ ] 3.1 YAML schema parser + validator (trigger/action/model/mode/sandbox/concurrency); invalid → marked, isolated. → verify: unit tests incl. unknown-kind isolation.
- [ ] 3.2 Dual-scope scanner (per-folder + global), scope tagging, merge. → verify: collision-across-scopes test.
- [ ] 3.3 Run/triage store writer; auto-archive empty; retention prune keep-100. → verify: 101st-run prune test.

## 4. Scheduler + trigger registry (capability: automation-trigger-registry)
- [ ] 4.1 `TriggerType` interface + `TriggerRegistry`; register `schedule`. → verify: registry contains `schedule` at boot.
- [ ] 4.2 Central scheduler: arm valid automations, fire cron occurrences once. → verify: cron-fire test (fake timers).
- [ ] 4.3 fs.watch `.pi/automation/` (clone `openspec-change-watcher`, 300ms debounce) → dispose+re-arm. → verify: edit re-arm, no duplicate fire.
- [ ] 4.4 Restart catch-up = skip (recompute next-fire forward). → verify: missed-fire-not-backfilled test.

## 5. Run lifecycle (capability: automation-run-lifecycle)
- [ ] 5.1 `fire` → resolve model (`@role` via roles plugin; bare id passthrough; unresolved → default + run error). → verify: role-resolution tests.
- [ ] 5.2 Spawn run session (action prompt|skill, mode, sandbox) via the §2.4 hook. → verify: prompt + skill spawn paths.
- [ ] 5.3 Concurrency policy (skip default / queue / parallel). → verify: skip-drop + queue-defer tests.
- [ ] 5.4 Run status tracking (running|done|error) + result.md capture. → verify: status transition test.

## 6. Content view (capability: automation-content-view)
- [ ] 6.1 `FolderAutomationSection` → `sidebar-folder-section` ("Automations (N) →"). → verify: slot render test; absent when disabled.
- [ ] 6.2 `AutomationBoard` (run list / Triage) → `command-route`; empty-runs filter. → verify: triage list tests.
- [ ] 6.3 `AutomationRunMonitor` → `shell-overlay-route`, wraps `ChatView(run.sessionId)`. → verify: renders live transcript.
- [ ] 6.4 `AutomationBadge` → `session-card-badge` (predicate-gated). → verify: predicate test.
- [ ] 6.5 `AutomationSettings` → `settings-section` (tab `general`): scopes + retention + default run visibility. → verify: settings render + default-visibility apply tests.
- [ ] 6.7 Editor `visibility` override field (hidden|shown) writing to `automation.yaml`. → verify: per-automation-override test.
- [ ] 6.6 `CreateAutomationDialog` + "Create Automation" action beside "New Session"; `ModelSelector` + role dropdown; writes to chosen scope. → verify: create-writes-scope + prompt.md tests.

## 7. Docs
- [ ] 7.1 Add `packages/automation-plugin/` rows to `docs/file-index-plugins.md` (caveman style, alphabetical).
- [ ] 7.2 Add Automation section pointer in `docs/architecture.md`.

## 8. Verify + integrate
- [ ] 8.1 `npm test` green for the new package + touched core. → verify: tee→grep no FAIL.
- [ ] 8.2 `openspec validate add-automation-plugin` passes.
- [ ] 8.3 Manual: create a 1-minute-interval schedule automation, watch a run in ChatView, confirm absent from board, confirm result.md + retention.
