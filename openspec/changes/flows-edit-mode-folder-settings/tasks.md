# Tasks

## 1. Generic folder-settings-section slot

- [x] 1.1 Add `folder-settings-section` to `packages/shared/src/dashboard-plugin/slot-types.ts` (react-only, `multiplicity: "many"`, description: plugin-contributed section on the DirectorySettings surface, props `{ cwd }`). Update manifest-validator if slot-specific validation is needed.
- [x] 1.2 Host the slot in `packages/client/src/components/DirectorySettings/DirectorySettings.tsx`: render claimed sections (ordered by claim `priority`) with the folder's cwd.
- [x] 1.3 Tests: a fixture claim renders on the folder settings page with the correct `cwd` prop; zero claims renders nothing extra; two claims order by priority.

## 2. Server: edit-mode read/write route (TDD — write tests first)

- [x] 2.1 Tests first (pattern: `resource-activation-routes.test.ts`): GET returns `{ project, global, effective }` for (a) both files absent, (b) global only, (c) project overriding global; PUT `{ scope: "project", enabled }` merges `flows.editFlow` into `<cwd>/.pi/settings.json` preserving foreign keys; PUT `{ scope: "global" }` targets `~/.pi/agent/settings.json`; malformed scope → 400. Use a temp homedir — never touch the real one.
- [x] 2.2 Implement the route (format-preserving JSON read-merge-write; effective = `project ?? global ?? false`). NOTE: implemented in `packages/flows-plugin/src/server/edit-mode-routes.ts` (plugins mount REST routes via `ctx.fastify`, automation-plugin precedent) — keeps the flows-specific route out of core.
- [x] 2.3 Wire route registration in the flows-plugin server entry (`mountEditModeRoutes(ctx.fastify)` before listen).

## 3. flows-plugin: claim + toggle + config removal

- [x] 3.1 Claim `folder-settings-section` in the flows-plugin manifest with a "Flow authoring (edit mode)" component; regenerate `packages/client/src/generated/plugin-registry.tsx`.
- [x] 3.2 Toggle component: GET on mount → render effective value with a "from global" hint when `project` is unset; on toggle PUT `{ scope: "project" }` then `POST /api/resources/reload { scope: "local", cwd }`.
- [x] 3.3 Retarget `FlowsSettings` (global settings section) to GET/PUT the `global` scope via the same route; remove its `usePluginConfig`/`plugin_config_write` wiring.
- [x] 3.4 Delete `editFlow` from `packages/flows-plugin/src/configSchema.json` (leave the schema otherwise intact).
- [x] 3.5 In `SessionFlowActions.tsx`: delete the reconcile `useEffect` (the `flows.length === 0` guard block); source `editMode` for the New/Edit gating from the effective read-back for the session's cwd instead of `usePluginConfig`.
- [x] 3.6 Tests: toggle renders at zero flows and with zero sessions for the cwd; toggling PUTs project scope then calls the local reload; "from global" hint shown when project unset; no `plugin_config_write` for edit-mode is emitted anywhere; subcard New/Edit gating follows the effective value.

## 4. Verify + land

- [x] 4.1 `npm test 2>&1 | tee /tmp/pi-test.log`; confirm no failures — 9266 passed, 0 failed.
- [x] 4.2 Quality gate: biome clean on the change's files + `tsc --noEmit` exit 0. (NOTE: `quality:changed` unusable in this worktree — its `--changed` base is the stale local `develop`; scoped `biome check <files>` used instead.)
- [ ] 4.3 `npm run build` + `curl -X POST http://localhost:8000/api/restart`; manual: in an empty cwd with no session, enable edit-mode on the folder settings page → `<cwd>/.pi/settings.json` has `flows.editFlow: true`; open a session → `flow_agents`/`flow_write` + edit-flow skill available; with a live session, toggling reloads it and tools appear without manual `/reload`.
- [x] 4.4 Advisory CodeRabbit gate run — CLI unavailable (ENOENT), deferred per warn-and-continue contract; PR-time CodeRabbit review covers it in the ship loop.
