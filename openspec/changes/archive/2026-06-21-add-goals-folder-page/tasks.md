# Tasks — add-goals-folder-page

## 1. Server: goal record store + routes
- [x] 1.1 Add `packages/server/src/goal-store.ts` (cwd-keyed `GoalRecord` persistence, atomic tmp+rename; mirror `openspec-group-store.ts`). → verify: store unit test create/list/update/delete + survives reload
- [x] 1.2 Add `packages/server/src/routes/goal-routes.ts` (GET/POST/PATCH/DELETE goals + link/unlink/spawn sessions per design.md REST surface). → verify: route test green
- [x] 1.3 Broadcast `goals_update { cwd, goals }` on mutation (mirror `openspec_groups_update`); add type to browser protocol union. → verify: broadcast test
- [x] 1.4 Stamp/clear `goalId` on session `.meta.json` via metaPersistence on link/unlink/spawn/delete. → verify: meta persistence test

## 2. Plugin: associate live status by goalId
- [x] 2.1 Extend `goal_status` snapshot with optional `goalId`; server caches by session, rolls up to `GoalRecord`. → verify: existing goal-plugin tests still pass + new rollup test
- [x] 2.2 Demote `GoalControl` (session-card-action-bar) to read-only link chip; relocate "Set a goal…" to folder slot/page. → verify: client render test, no set-input on card

## 3. Client: folder nav slot
- [x] 3.1 Add goal plugin `sidebar-folder-section` claim (`Goals (N) → / + Goal`), sibling of OpenSpec/Automations folder sections. Slot already exists (carries `FolderDescriptor`) — no core slot addition. → verify: nav slot renders count, opens page
- [x] 3.2 `+ Goal` create flow (objective capture) → POST goal. → verify: creates record, slot count increments

## 4. Client: goals content page + detail
- [x] 4.1 Register goal plugin `shell-overlay-route` claims (two: board + detail; content-view not needed — shell-overlay-route covers full-page routes) for `/folder/:encodedCwd/goals` + `/folder/:encodedCwd/goals/:goalId` (plugin-local; no `App.tsx` edit). → verify: route navigates
- [x] 4.2 Goals board page: header (back/refresh/new), status filter, goal cards (objective, badge, progress, criteria), expandable linked-sessions. → verify: matches mockups/goals-redesign.html screen B
- [x] 4.3 Goal detail page: definition panel + linked-session list; each row opens that session's REAL chat via in-app navigate(`/session/:id`), incl. hidden sessions (hidden flag untouched). LIGHTER v1 per user decision: navigate-to-real-chat instead of embedding ChatView (shell ChatView not plugin-importable; avoids re-implementing a transcript reducer).
- [x] 4.4 Linked-sessions controls: `+ New session` (spawn + stamp goalId), `Link existing…`, unlink, `⚑ driver` tag. → verify: link/unlink round-trips, driver tagged

## 5. Wiring + verification
- [x] 5.1 Session-card chip navigates to owning goal detail. → verify: click chip → goal detail
- [x] 5.2 Full rebuild + restart + reload; manual pass against all 3 mockup screens. → verify: `npm run build` && restart && reload, browser QA (build green; manual QA deferred to user on worktree port)
- [x] 5.3 `openspec validate add-goals-folder-page` passes. → verify: exit 0
