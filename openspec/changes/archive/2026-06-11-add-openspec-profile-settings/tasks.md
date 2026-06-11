## 1. Shared platform layer

- [x] 1.1 Add `OPENSPEC_CONFIG_PROFILE` recipe to `packages/shared/src/platform/openspec.ts` (`["openspec","config","profile",preset]`) + `configProfile()` / `configProfileOr()` runners.
- [x] 1.2 Add `OPENSPEC_UPDATE` recipe (`["openspec","update"]`, longer timeout ~30s) + `update()` / `updateOr()` runners scoped to a cwd.
- [x] 1.3 Add `writeOpenSpecConfigFile(partial)` helper: resolve `~/.config/openspec/config.json`, read-merge `profile`+`workflows` preserving other keys, write atomically (tmp file in same dir + `rename`). Return success/error.
- [x] 1.4 Add `workflowSetSignature(workflows: string[]): string` helper (stable hash over sorted, de-duped workflow names).
- [x] 1.5 Export `EXPANDED_WORKFLOWS` and `CORE_WORKFLOWS` constants from shared so client + server agree on the fixed sets.
- [x] 1.6 Unit tests: atomic write leaves original intact on failure; signature is order-independent; recipes build expected argv.

## 2. Preferences store — per-cwd update signatures

- [x] 2.1 Add `openspecUpdateSignatures: Record<string, string>` to the preferences shape in `packages/server/src/preferences-store.ts` (default `{}`; absence tolerated for old files).
- [x] 2.2 Add `getOpenSpecUpdateSignature(cwd)` / `setOpenSpecUpdateSignature(cwd, sig)` accessors with persistence.
- [x] 2.3 Unit test: set/get round-trips and persists across store reloads.

## 3. Server — config write endpoint

- [x] 3.1 Add `POST /api/openspec/config` to `packages/server/src/routes/openspec-routes.ts` behind `networkGuard`; validate body `{ profile, workflows }`.
- [x] 3.2 Branch: `core` → run `OPENSPEC_CONFIG_PROFILE` preset; `expanded`/`custom` → `writeOpenSpecConfigFile({ profile, workflows })` (expanded writes `profile:"expanded"` + `EXPANDED_WORKFLOWS`).
- [x] 3.3 On success, invalidate the route's 30s `configCache` (clear all entries or those for known cwds).
- [x] 3.4 Return `{ success, error? }`; do NOT run `openspec update` and do NOT touch any project cwd.
- [x] 3.5 Tests: core path invokes preset; expanded/custom path writes JSON with correct profile/workflows; cache busted; no project files written.

## 4. Server — update + status endpoints

- [x] 4.1 Add helper to compute known cwds = union(active session cwds, pinned dirs), reusing existing session-manager + preferences accessors.
- [x] 4.2 Add `POST /api/openspec/update` behind `networkGuard`: `{ cwd }` updates one project; `{ all: true }` iterates known cwds. Run `OPENSPEC_UPDATE` per cwd; on success record `workflowSetSignature(currentGlobalWorkflows)` for that cwd.
- [x] 4.3 In the `all` path, collect per-cwd results; a single failure must not abort the batch. Return a results array.
- [x] 4.4 Add `GET /api/openspec/update-status`: for each known cwd return `up-to-date | needs-update | unknown` by comparing stored signature to current global signature.
- [x] 4.5 Tests: single + all update paths; signature recorded on success; status classification for the three cases; one cwd failure doesn't block others.

## 5. Client — API helpers

- [x] 5.1 In `packages/client/src/lib/openspec-config-api.ts` add `saveOpenSpecConfig(profile, workflows)` POST helper.
- [x] 5.2 Add `runOpenSpecUpdate({ cwd } | { all: true })` and `fetchUpdateStatus()` helpers.
- [x] 5.3 After a successful save, call `__resetOpenSpecConfigCache()` and refetch so buttons re-render.
- [x] 5.4 Tests: helpers POST correct bodies; cache reset invoked on save success.

## 6. Client — OpenSpec Profile settings section

- [x] 6.1 Create `packages/client/src/components/OpenSpecProfileSection.tsx`: profile radio (Core/Expanded/Custom); selecting Core/Expanded fills the fixed workflow set; Custom enables the 11-chip multiselect.
- [x] 6.2 Add the warning banner (global blast radius) and the **Save profile** button wired to `saveOpenSpecConfig`.
- [x] 6.3 Add the **Update all projects** button wired to `runOpenSpecUpdate({ all: true })`.
- [x] 6.4 Add the **collapsible** per-cwd list (collapsed by default) rendering staleness badges from `fetchUpdateStatus()` + a per-cwd **Update** button wired to `runOpenSpecUpdate({ cwd })`. Disable the per-cwd button when `up-to-date`.
- [x] 6.5 Refresh staleness badges after any update completes.
- [x] 6.6 Mount the section in `SettingsPanel` Advanced tab, below the OpenSpec polling section.
- [x] 6.7 Component tests: Custom toggles the multiselect; Save posts the right payload; per-cwd list starts collapsed and expands; badges reflect status; Update buttons post correct bodies.

## 7. Docs + verification

- [x] 7.1 Add file-index rows for new files (`OpenSpecProfileSection.tsx`, shared helpers) to the matching `docs/file-index-*.md` splits via a docs subagent (caveman style).
- [x] 7.2 Add an FAQ entry: "How do I change the OpenSpec profile from the dashboard?" pointing at Settings → Advanced.
- [x] 7.3 Run `npm test`; pipe to tmp + grep for failures. Manually verify: save each profile, confirm buttons change, run per-cwd + update-all, confirm badges flip to up-to-date.
