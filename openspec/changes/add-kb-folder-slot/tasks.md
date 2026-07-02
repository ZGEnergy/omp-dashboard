# Tasks — add-kb-folder-slot

## 0. Scaffold the plugin
- [ ] 0.1 Scaffold `packages/kb-plugin` (dashboard plugin: `package.json` `claims` + `src/client` + `src/server`) via the `dashboard-plugin-scaffold` skill. Imports Layer-1 `@blackbelt-technology/pi-dashboard-kb`; independent of the Layer-2 session extension. → verify: plugin builds, registers in the plugin registry with empty claims

## 1. Server: KB stats + reindex routes
- [ ] 1.1 Add `packages/kb-plugin/src/server/kb-routes.ts` importing `@blackbelt-technology/pi-dashboard-kb` (`loadConfig`, `SqliteFtsStore`, `indexSource`). `GET /api/kb/stats?cwd` → `{ files, chunks, indexed, staleCount, indexing }` via `store.counts()`. → verify: route test returns counts for a seeded db, `indexed:false` for empty
- [ ] 1.2 `POST /api/kb/reindex?cwd` → run `indexSource` over `loadConfig(cwd).resolvedSources`; return `{ changed, chunks }` (or `202 { jobId, status }`). → verify: reindex of a fixture folder yields `chunks > 0`
- [ ] 1.3 Per-cwd job registry (`Map<cwd, JobState>`): coalesce concurrent reindex, expose `indexing` + last result to `/stats`. → verify: two parallel POSTs start one walk
- [ ] 1.4 Validate `cwd` against known folder descriptors; reject unknown paths. → verify: unknown cwd rejected, no store opened
- [ ] 1.5 `staleCount` from `dox-staleness.json` (source-file drift only). → verify: seeded staleness file yields expected count; scoped away from md

## 2. Client: useKbStats hook
- [ ] 2.1 Add `useKbStats(cwd)` (fetch `/api/kb/stats`, `reindex()` → POST, poll while `indexing`). → verify: hook test — poll starts on indexing, stops on completion
- [ ] 2.2 Guard fetch via the client-utils fetch-json wrapper (response validation). → verify: malformed response handled

## 3. Client: FolderKbSection slot claim
- [ ] 3.1 Add `packages/kb-plugin/src/client/FolderKbSection.tsx` (structural copy of `FolderGoalsSection`), claim `sidebar-folder-section`. Slot already carries `FolderDescriptor` — no core slot addition. → verify: row renders count, sibling of Goals/Automations
- [ ] 3.2 Five-state derivation (not-indexed / indexing / populated / stale / error) per design §5, matching `mockups/sidebar-kb-slot.html`. → verify: render test per state
- [ ] 3.3 Reindex control → `reindex()`; `Index now` for empty; `Retry` for error; count tooltip `F files · N chunks`. → verify: click triggers POST, count updates on completion
- [ ] 3.4 Register the claim in the `kb-plugin` manifest (`package.json` `claims`). → verify: claim appears in registry, renders in folder group

## 4. Server: KB config read/write routes
- [ ] 4.1 `GET /api/kb/config?cwd` → `{ config, origin, projectPath }` via `loadConfig(cwd)`. Reuse cwd validation from 1.4. → verify: route test returns origin=project/global/defaults per fixture
- [ ] 4.2 `PUT /api/kb/config?cwd` → merge edited path-fields over current project file, run `validateConfig`, atomic tmp+rename write; `400` on invalid (no write). → verify: valid write persists; invalid rejected + no file; untouched `ranking` preserved
- [ ] 4.3 Bootstrap: `PUT` on `origin !== project` scaffolds a new project file (reuse `init.ts` scaffold). → verify: worktree with no file gets one written
- [ ] 4.4 Optional reindex kick after successful write. → verify: count reflects new sources

## 5. Client: KB settings panel (behind `→`)
- [ ] 5.1 `useKbConfig(cwd)` hook (GET config, `save(patch)` → PUT). → verify: hook test round-trips
- [ ] 5.2 Register `shell-overlay-route` claim `/folder/:encodedCwd/kb` (plugin-local; no `App.tsx` edit); wire the folder row `→` to navigate there. → verify: `→` opens the page
- [ ] 5.3 `KbSettingsPanel.tsx`: list sources (add/remove/reorder priority), edit include/exclude/dbPath, show origin + count, `Save + Reindex`. Round-trip untouched config fields. → verify: matches settings mockup screen; PUT carries full config
- [ ] 5.4 Worktree affordances: `Create project config` + `Copy from parent repo` (rewrite sources relative to worktree cwd). → verify: copy seeds sources, save indexes

## 6. Worktree verification
- [ ] 6.1 Create a worktree with no live session; confirm row shows `not indexed`; click `Index now`; confirm `chunks > 0` after. → verify: manual + e2e against docker harness
- [ ] 6.2 Confirm server reindex works with zero attached pi sessions (session-less path). → verify: reindex succeeds with no bridge connected
- [ ] 6.3 Worktree with no project config: open KB settings, `Copy from parent repo`, save; confirm sources indexed. → verify: worktree KB populated from copied config

## 7. Wiring + verification
- [ ] 7.1 Confirm `packages/kb-plugin` wiring end-to-end: all claims (`sidebar-folder-section`, `shell-overlay-route`) + all four routes registered and reachable. (Host decided in design §1b: new `kb-plugin`, not folded into an existing plugin.) → verify: builds, claims + routes live
- [ ] 7.2 Add file-index rows for new files per Documentation Update Protocol (delegate to subagent, caveman style). → verify: rows in `docs/file-index-server.md` + `docs/file-index-plugins.md` (or client split)
- [ ] 7.3 Full rebuild + restart + reload; manual pass against `mockups/sidebar-kb-slot.html` + `mockups/kb-settings.html`. → verify: `npm run build` && restart && reload, browser QA
- [ ] 7.4 `openspec validate add-kb-folder-slot --strict` passes. → verify: exit 0
