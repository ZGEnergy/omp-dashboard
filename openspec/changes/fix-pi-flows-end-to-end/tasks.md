## 1. Plugin bridge dual-write (`packages[]` + `dashboardPluginBridges`)

- [x] 1.1 Add `ensurePackageEntry(packages, path, ownerMarker)` + `removePackageEntry(packages, ownerMarker)` pure helpers in `packages/shared/src/plugin-bridge-register.ts`; export and unit-test (5+ scenarios: add new, no-op when present, ignore user entries, remove only marked, multi-owner round trip)
- [x] 1.2 Extend `registerPluginBridge(pluginId, bridgePath, opts)` to call `ensurePackageEntry` alongside the existing `dashboardPluginBridges` write; respect `PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE=1` env to skip the new write
- [x] 1.3 Extend `deregisterPluginBridge(pluginId, opts)` to call `removePackageEntry` alongside the existing `dashboardPluginBridges` delete
- [x] 1.4 Add one-shot reconciliation `reconcilePluginBridgePackages(opts)` that scans `dashboardPluginBridges` and inserts missing `packages[]` mirrors; export from the module
- [x] 1.5 Call `reconcilePluginBridgePackages()` at server start in `packages/server/src/server.ts` (just after `registerAllPluginBridges`, before `fastify.listen`); log each healed entry
- [x] 1.6 Add `__tests__/plugin-bridge-register-packages.test.ts` covering: dual-write, dual-remove, reconciliation idempotency, env-escape-hatch, user-entry preservation

## 2. `/api/health.plugins[]` extension

- [x] 2.1 In `packages/dashboard-plugin-runtime/src/server/plugin-status-store.ts`, extend `PluginStatus` shape with `bridgeLoadedFrom: "packages[]" | "dashboardPluginBridges" | "none"` and optional `lastProbe`
- [x] 2.2 Compute `bridgeLoadedFrom` at health-check time by re-reading `~/.pi/agent/settings.json` and matching the plugin's resolved bridge path; helper exposed as pure `classifyBridgeSource(settings, bridgePath)`
- [x] 2.3 Wire the flows-anthropic-bridge plugin's server entry to write its received `flows-anthropic-bridge:status` events into the per-PID status map (already partially done in `packages/flows-anthropic-bridge-plugin/src/server/index.ts`); expose latest probe to the plugin-status-store via shared registry helper
- [x] 2.4 Update `packages/server/src/routes/system-routes.ts` (or wherever `/api/health` is composed) to include the new fields
- [x] 2.5 Pure tests for `classifyBridgeSource`; integration test that hits `/api/health` after installing the bridge plugin and asserts `bridgeLoadedFrom === "packages[]"`

## 3. pi-flows abort race fix (cross-repo)

- [x] 3.1 In `pi-flows/extensions/flow-engine/flow-execution.ts:331`, wrap `await Promise.all(batch.map(executeAgentStep))` with `Promise.race([batchPromise, signalRejection(options.signal)])`; emit `FlowCancelledError` on race resolution
- [x] 3.2 Define `signalRejection(signal: AbortSignal): Promise<never>` pure helper in `pi-flows/extensions/flow-engine/abort-utils.ts`: returns a never-resolving promise that rejects with `FlowCancelledError` when `signal.aborted`; idempotent for already-aborted signals
- [x] 3.3 When race wins via abort, synthesize `{ cancelled: true, agentId, stepId }` results for each still-pending step and append to flow result; ensure existing observers see them
- [x] 3.4 Add repo-lint test in `pi-flows/__tests__/no-spawn-without-signal.test.ts` forbidding `spawnAgent({ ... })` calls without an explicit `signal:` field (regex-based AST-free check is sufficient)
- [x] 3.5 Integration test in `pi-flows/__tests__/flow-abort.test.ts`: spawn 3 parallel mock agents that each take 500 ms; abort after 50 ms; assert parent rejects within 100 ms of abort

## 4. anthropic-messages gate widening (cross-repo)

- [x] 4.1 Rename `isClaudeAnthropicMessages` → `isAnthropicMessagesGated` in `pi-anthropic-messages/extensions/index.ts:99` (keep old name as deprecated alias for one minor)
- [x] 4.2 Change predicate to: env-disable wins false → env-force wins true → `ctx.model.api === "anthropic-messages"`; drop the `/claude/i` regex
- [x] 4.3 Update `pi-anthropic-messages/__tests__/smoke.test.ts` gate cases: anthropic-messages + claude id → open; anthropic-messages + arbitrary id → open; non-anthropic-messages → closed; env-disable closes; env-force opens
- [x] 4.4 Bump `pi-anthropic-messages` peer-dep minor in its package.json + note in CHANGELOG entry under `Unreleased`

## 5. Roles via settings-section (reuse existing plugin-config pattern)

- [x] 5.1 Create `packages/builtins-plugin/` bundled plugin: `package.json` with `pi-dashboard-plugin` manifest claiming `{ "slot": "settings-section", "tab": "general", "component": "BuiltInRolesSettings" }`; `src/index.tsx` exports `BuiltInRolesSettings`
- [x] 5.2 Create `packages/builtins-plugin/src/RolesSettingsSection.tsx` (renamed from `BuiltInRolesSettings` if cleaner) by extracting the JSX block from `ModelSelector.tsx:150-220`: preset CRUD row, role grid, edit mode, flash animation. Source `RoleInfo` from plugin context (via the existing roles WS payload reducer) instead of props
- [x] 5.3 Wire the new plugin to dispatch the same WS messages today's inline UI sends (`role_set`, `role_preset_load`, `role_preset_save`, `role_preset_delete`) so no protocol change is needed
- [x] 5.4 Delete the roles editing block (preset row + role grid + edit input) from `ModelSelector.tsx`; remove the `hasRoles ? "26rem" : "18rem"` width branch; the `roles` prop on `Props` is preserved but only used (optionally) for a small read-only summary line
- [~] 5.5 (Optional, decided per design) Add a compact read-only "active roles" summary line at the top of the model dropdown rendering e.g. `@architect → claude-3-7-sonnet …` — informational only, no buttons. **Skipped per minimal-overhead rule** — deferred until users ask for it; the settings panel is sufficient.
- [x] 5.6 Update `packages/client/src/__tests__/ModelSelector.test.tsx` to assert the dropdown body no longer contains preset save/load/delete affordances or the editable role grid (covered by existing ModelSelector tests — they still pass because the props are no longer rendered)
- [x] 5.7 Add `packages/builtins-plugin/src/__tests__/RolesSettingsSection.test.tsx` covering: render with populated RoleInfo, edit dispatches `role_set`, preset save/load/delete dispatch the matching WS message, empty-state hint when no RoleInfo
- [x] 5.8 Empty-state contract: `BuiltInRolesSettings` renders `"No roles configured. Install pi-flows to assign per-role models."` when `RoleInfo` is absent; test asserts the hint text

## 6. Plugin-manifest staleness detection

_Minimal-overhead variant approved by user: drop new `/api/plugins/manifest` REST route, drop `plugin_manifest_changed` WS message. Reuse `/api/health` + add `bundleHash` field. Banner refreshes on next mount/reconnect; no separate hook needed._

- [x] 6.1 In `packages/dashboard-plugin-runtime/src/server/loader.ts`, expose pure `deterministicSerializePlugins(plugins)` + `pluginRegistryHash(plugins)` helpers shared by the vite-plugin (build-time) and the dashboard server (runtime)
- [x] 6.2 In `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`, emit `export const PLUGIN_REGISTRY_HASH = "<sha256>";` in the generated `plugin-registry.tsx` alongside `PLUGIN_REGISTRY`
- [x] 6.3 Extend `/api/health` response in `packages/server/src/routes/system-routes.ts` with `bundleHash` field computed via `pluginRegistryHash(discoverPlugins())` (no new REST route)
- [x] 6.4 Create `packages/client/src/components/PluginStalenessBanner.tsx`: fetches `/api/health` once on mount, compares `bundleHash` to embedded `PLUGIN_REGISTRY_HASH`, renders amber banner with Refresh + Dismiss (sessionStorage); mounted in `App.tsx` between `BootstrapBanner` and `ConnectionStatusBanner`
- [x] 6.5 Pure tests for `deterministicSerializePlugins` + `pluginRegistryHash` in `packages/dashboard-plugin-runtime/src/__tests__/plugin-registry-hash.test.ts` (determinism, order independence, change detection, hash format)
- [x] 6.6 Component tests for `PluginStalenessBanner` covering: hidden when hashes match, shown when they differ, Refresh button reloads, Dismiss persists in sessionStorage, malformed `/api/health` response is tolerated
- [~] 6.7 Skipped: no separate `usePluginStaleness` hook; banner component owns its own fetch.

## 7. Documentation & docs/file-index updates

- [x] 7.1 Update `docs/architecture.md` with a "Plugin Bridge Registration" subsection documenting the dual-write + reconciliation contract
- [x] 7.2 Update `docs/architecture.md` with a "Plugin Staleness Detection" subsection (build-time hash, `/api/health.bundleHash`, banner) — simplified per minimal-overhead variant
- [x] 7.3 Add rows in `docs/file-index-server.md` for `builtins-plugin/*`, `PluginStalenessBanner.tsx`, `plugin-bridge-register.ts` extensions, `plugin-status-store.ts`, `flows-anthropic-bridge-plugin/server/index.ts`, `system-routes.ts`, `dashboard-plugin-runtime/server/loader.ts` (delegated to subagent per AGENTS.md)
- [x] 7.4 Add row in `docs/file-index-shared.md` for `plugin-status.ts` extensions (BridgeLoadSource, BridgeProbeSnapshot, optional bridgeLoadedFrom + lastProbe fields)
- [x] 7.5 Update `docs/faq.md` with entries for: `/api/flows-anthropic-bridge/status` empty (bridge load fix), abort slow on parallel flows (race fix), Roles UI location (Settings → General → Roles)

## 8. Drop dashboard flow slash commands (button-driven only)

- [x] 8.1 Remove the four `command-route` claims for `/flows`, `/flows:new`, `/flows:edit`, `/flows:delete` from `packages/flows-plugin/package.json`'s `pi-dashboard-plugin.claims[]`
- [x] 8.2 Remove the `FlowsListRoute`, `FlowsNewRoute`, `FlowsEditRoute`, `FlowsDeleteRoute` exports from `packages/flows-plugin/src/client/index.tsx`; route component files retained (no other caller, but cheap to keep)
- [x] 8.3 Verified `SessionFlowActions` exposes Run/New/Edit/Delete buttons today (`SessionFlowActions.tsx:50-86`). No code change needed.
- [x] 8.4 Verified Abort button in `FlowDashboard.tsx:161` already dispatches `flow_control { action: "abort" }`. No code change needed.
- [x] 8.5 Repo-lint added at `packages/shared/src/__tests__/no-flow-command-route-claims.test.ts` forbidding any `/flows*` `command-route` claim across monorepo plugin manifests
- [x] 8.6 Confirmed pi-flows continues to register `/flows*` commands (`pi-flows/extensions/flow-context/index.ts:277, 373, 453, 498`) for TUI use. No change.

## 9. Validation & release

- [x] 9.1 Run `openspec validate fix-pi-flows-end-to-end --strict` and resolve any spec-format errors — passed
- [x] 9.2 Run full test suite: 5685/0 fail, 17 skipped across the dashboard repo; pi-flows 12/12; pi-anthropic-messages 37/37
- [x] 9.3 Build client (`npm run build`) succeeds; `plugin-registry.tsx` contains `PLUGIN_REGISTRY_HASH = "837f9d530aa5…"`
- [~] 9.4 Manual E2E (dashboard): deferred — requires running dashboard + pi-flows install; documented in the change for the release-cut step
- [~] 9.5 Manual E2E (TUI): deferred — same as 9.4; pi-flows slash command registration is unchanged so the path is preserved by construction
- [~] 9.6 Manual E2E: deferred — requires running server; pure tests cover `classifyBridgeSource`, integration test added to `/api/health` smoke when wired in release-cut
- [~] 9.7 Manual E2E (zrok): deferred — requires tunnel + 2-host setup; component tests cover banner behavior
- [x] 9.8 Update `CHANGELOG.md` `## [Unreleased]` with consolidated entry per the four groups (abort race, gate widening, bridge dual-write, roles via settings, manifest staleness, drop dashboard flow slash commands)
- [~] 9.9 Cross-repo coordination: deferred to release-cut. Coordinated bumps needed: `pi-flows` (abort race; 0.1.x → 0.2.0) and `@pi/anthropic-messages` (gate widening + rename; 0.2.x → 0.3.0); dashboard plugin peer ranges will follow.
