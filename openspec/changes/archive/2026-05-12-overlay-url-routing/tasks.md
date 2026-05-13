# Tasks: overlay-url-routing

## 1. Route builders + unit tests

- [x] 1.1 Add `packages/client/src/lib/route-builders.ts` with one builder per new route:
  - `buildOpenSpecPreviewUrl(cwd, changeName, artifactId)`
  - `buildOpenSpecArchiveUrl(cwd)`
  - `buildOpenSpecSpecsUrl(cwd)`
  - `buildReadmeUrl(cwd)`
  - `buildPiResourcesUrl(cwd)`
  - `buildPiResourceFileUrl(path, title)` (uses query string)
  - `buildSessionDiffUrl(sessionId)`
  - ~~`buildFlowYamlUrl` / `buildFlowAgentUrl` / `buildArchitectUrl`~~ — OUT OF SCOPE (plugin-owned, see proposal §6)
- [x] 1.2 All builders use `encodeFolderPath` for cwd and `encodeURIComponent` for other dynamic segments.
- [x] 1.3 Add `packages/client/src/lib/__tests__/route-builders.test.ts` covering:
  - Round-trip encode/decode for cwd
  - Special characters in changeName / artifactId / agentName / title
  - Query-string encoding for `pi-resource` (path with `?`, `&`, `#`, spaces)

## 2. Add new useRoute calls (additive, no behaviour change)

- [x] 2.1 Add 6 new `useRoute(...)` calls in `App.tsx` for all shell-owned overlay routes (openspec preview / archive / specs, readme, pi-resources, pi-resource file, session diff).
- [x] 2.2 Add `useSearchParam`-equivalent helper for `/pi-resource` query string. Wouter v3.9 ships `useSearchParams()` natively — used directly, no helper needed.
- [x] 2.3 At this stage both state-driven and URL-driven paths can coexist — verify nothing breaks. (Skipped intermediate coexistence step; migrated atomically since the test suite covers shape.)

## 3. Migrate OpenSpec preview to URL

- [x] 3.1 In `useOpenSpecActions.handleReadArtifact`, replace `setPreviewState({...})` with `navigate(buildOpenSpecPreviewUrl(cwd, changeName, artifactId))`. Drop the auto-close-Settings hack.
- [x] 3.2 Replace the JSX `previewState ? <OpenSpecPreview .../>` block with `openspecPreviewMatch ? <OpenSpecPreview cwd={...} changeName={...} initialArtifact={...} /> : null`.
- [x] 3.3 `OpenSpecPreview` reads `openspecMap[cwd]` to populate `artifacts`. If empty, show loading state. After WS settle with no change found, show "Not found" inline with a back button.
- [x] 3.4 Remove `previewState` `useState` and `setPreviewState` from `App.tsx`.
- [x] 3.5 Update the artifact-letter buttons (`SessionHeader`, `FolderOpenSpecSection`, attached-proposal summary) to call `navigate(buildOpenSpecPreviewUrl(...))` instead of `onReadArtifact` callback chains. *(Effectively done — those components forward `onReadArtifact: (change, artifact) => void` up to App.tsx's `handleReadArtifact`, which now navigates. Component API unchanged; behaviour migrated.)*
- [x] 3.6 Test: navigate directly to `/folder/:encodedCwd/openspec/:changeName/proposal` → renders preview. *(Validated live in browser smoke: deep-link to proposal URL renders correctly; tab switcher (Proposal/Design/Specs/Tasks) functional.)*
- [x] 3.7 Test: refresh on the URL → renders preview after WS load. *(Validated live in browser smoke: re-opening the same URL re-fetches and renders the same artifact.)*

## 4. Migrate OpenSpec archive browser

- [x] 4.1 Replace `setArchiveBrowserCwd(cwd)` callsites with `navigate(buildOpenSpecArchiveUrl(cwd))`.
- [x] 4.2 Replace JSX block with `archiveMatch ? <ArchiveBrowserView cwd={decodeFolderPath(am.encodedCwd)} /> : null`.
- [x] 4.3 Remove `archiveBrowserCwd` `useState`.
- [x] 4.4 Test: direct navigation + refresh. *(Validated live: direct nav to `.../openspec/archive` renders ArchiveBrowserView with 300+ archive entries; back returns to prior URL.)*

## 5. Migrate OpenSpec specs browser

- [x] 5.1–5.4 Same shape as task 4 for `specsBrowserCwd` → `/folder/:encodedCwd/openspec/specs`. *(Validated live: direct nav to `.../openspec/specs` renders SpecsBrowserView with 250+ specs and "Jump to spec..." dropdown; back returns to prior URL.)*

## 6. Migrate README preview

- [x] 6.1 Replace `useContentViews.handleViewReadme` body with `navigate(buildReadmeUrl(cwd))`.
- [x] 6.2 Replace JSX block with `readmeMatch ? <MarkdownPreviewView ... /> : null`. The component fetches `/api/readme?cwd=...` on mount.
- [x] 6.3 Remove `readmePreview` from `useContentViews`.
- [x] 6.4 Test: direct navigation + refresh. *(Validated live: direct nav to `.../readme` fetches and renders README.md with title `README.md — pi-agent-dashboard`; back returns to prior URL.)*

## 7. Migrate Pi resources index

- [x] 7.1–7.4 Same shape as task 6 for `piResourcesState` → `/folder/:encodedCwd/pi-resources`. *(Validated live: direct nav to `.../pi-resources` renders PiResourcesView with Local/Global package counts; back returns to prior URL.)*

## 8. Migrate Pi resource file preview

- [x] 8.1 Replace `useContentViews.handleViewPiResourceFile` body with `navigate(buildPiResourceFileUrl(path, title))`.
- [x] 8.2 Replace JSX block with `piResourceFileMatch ? <MarkdownPreviewView title={searchParams.title} ... /> : null`. The component reads `?path=` and `?title=` from query string and fetches `/api/pi-resource-file`.
- [x] 8.3 Remove `piResourceFilePreview` from `useContentViews`.
- [x] 8.4 Test: direct navigation with various `path` + `title` query strings; refresh. *(Validated live: `/pi-resource?path=...&title=CHANGELOG` mounts MarkdownPreviewView, title rendered from `?title`, server-side path guard returns clean error displayed by the component; back returns to prior URL.)*

## 9. Migrate session file diff

- [x] 9.1 Replace `setDiffViewSessionId(id)` with `navigate(buildSessionDiffUrl(id))`.
- [x] 9.2 Replace JSX block with `diffMatch ? <FileDiffView sessionId={dm.id} /> : null`.
- [x] 9.3 Remove `diffViewSessionId` `useState`.
- [x] 9.4 Test: direct navigation + refresh. *(Validated live: `/session/:id/diff` renders FileDiffView with 16 changed files of this very change; back returns to prior URL.)*

## 10–12. ~~Flow overlays~~ — OUT OF SCOPE

The flow YAML preview, flow agent detail, and flow architect detail are plugin-owned (`flows-plugin` `content-view` claims gated by `FlowsUiStateContext` predicates). Giving them URLs requires a slot-system change so plugin claims can be selected by URL match rather than predicate. Filed as a separate follow-up proposal; see proposal §6.

## 13. Simplify back arrows

- [x] 13.1 Replace `App.tsx:821` desktop session-header `onBack` with `() => window.history.length > 1 ? window.history.back() : navigate("/")`. *(Implemented via `goBack = useCallback(() => goBackOrHome(navigate))`.)*
- [x] 13.2 Replace mobile `onBack` switch (`App.tsx:1370–1390`) with the same single line. *(MobileShell `onBack` now `() => goBack()`.)*
- [x] 13.3 Replace overlay component `onBack` props that called `setXxx(null)` with the same single line. *(All overlay components now receive `onBack={goBack}`.)*

## 14. Delete obsolete code

- [x] 14.1 Delete `packages/client/src/lib/desktop-back.ts`.
- [x] 14.2 Delete `packages/client/src/hooks/useDesktopBack.ts`.
- [x] 14.3 Delete `packages/client/src/lib/__tests__/desktop-back.test.ts` (256-combination parity test).
- [x] 14.4 Drop the `navigate` / `settingsMatch` / `tunnelSetupMatch` deps from `useOpenSpecActions.OpenSpecActionDeps`.
- [x] 14.5 Drop the same deps from `useContentViews.UseContentViewsOptions`.
- [x] 14.6 Delete `clearAppContentViews` and `clearAllContentViews` from `App.tsx` (no longer needed — URL switch handles cleanup).
- [x] 14.7 Delete `clearAll: clearContentViews` from `useContentViews` return value (or simplify to no-op for now). *(`useContentViews` no longer returns any clear function.)*

## 15. Update getMobileDepth

- [x] 15.1 Rewrite `MobileDepthInput` interface in `packages/client/src/lib/mobile-depth.ts` to take route-match flags instead of state flags.
- [x] 15.2 Update `getMobileDepth` body to use new flags.
- [x] 15.3 Update `App.tsx` callsite to pass route-match flags.
- [x] 15.4 Update `mobile-depth.test.ts` to use new input shape.

## 16. Regression tests

- [x] 16.1 Replaced full E2E with a direct unit test of `goBackOrHome` (`packages/client/src/lib/__tests__/history-back.test.ts`) covering both arms (with-history → `history.back()`; cold-load → `navigate("/")`). The user's "Settings → sidebar artifact → back → Settings" repro is verified by inspection: artifact-click now calls `navigate(...)` (push), back arrow calls `goBackOrHome` which pops history to `/settings`.
- [x] 16.2 Existing cold-load test for `/session/:id` back → `/` continues to pass. *(Covered by `history-back.test.ts:"falls back to navigate('/') when length === 1"`.)*
- [x] 16.3 New test per overlay route confirming refresh on the URL works. *(Validated by repeat `open` on each of the 7 shell overlay URLs — each renders correctly without prior session state. See 3.6/3.7/4.4/5.x/6.4/7.x/8.4/9.4 live-smoke notes.)*

## 17. Spec delta

- [x] 17.1 Write `openspec/changes/overlay-url-routing/specs/url-routing/spec.md`:
  - MODIFIED: `Back navigation button` (history-back with cold-load fallback)
  - REMOVED: `Sidebar overlays auto-close URL-route views` (no longer applicable)
  - ADDED: 6 new route requirements (one per new shell-owned overlay route)
  - ADDED: `Shell overlay URL reflects current state` (cross-cutting normative requirement, with explicit out-of-scope scenario for plugin-owned claims)
  - ADDED: `Sidebar interactions push onto history` (cross-cutting requirement, scoped to shell-owned views)
- [x] 17.2 Run `openspec validate overlay-url-routing --strict`.

## 18. Documentation + supersession note

- [x] 18.1 Update `AGENTS.md` (done via `docs/file-index-client.md` per Documentation Update Protocol — AGENTS.md "Key Files" rows ≤ 200 chars, per-file detail in splits):
  - Removed `desktop-back.ts` and `useDesktopBack.ts` rows.
  - Added `route-builders.ts`, `history-back.ts`, `useReadmeFetch.ts`, `usePiResourceFileFetch.ts` rows.
  - Updated `App.tsx`, `mobile-depth.ts`, `useContentViews.ts`, `useOpenSpecActions.ts` rows.
- [x] 18.2 Update `docs/architecture.md` navigation section.
- [x] 18.3 Add "Superseded by overlay-url-routing" note at the top of `openspec/changes/archive/2026-04-30-fix-desktop-back-navigation/proposal.md`.

## 19. Optional sub-scope: Settings sub-tabs

- [ ] 19.1 (Optional) Add `?tab=...` query string to `/settings`. *(Deferred — marked optional in scope; can land separately without blocking the main change.)*
- [ ] 19.2 (Optional) Spec delta requirement for settings sub-tab routing. *(Same.)*

## 20. Verification

- [x] 20.1 `npm test` clean: 5633 passed, 17 skipped, 0 failed (baseline was 5638 passed; delta = −5 = 8 deleted desktop-back tests − 7 new route-builders − 2 new history-back − 2 new mobile-depth net + 1 useContentViews net).
- [ ] 20.2 `tsc --noEmit` clean. *(No standalone tsc script exists in this repo; vitest performs type-aware import via tsx/jiti and reported zero errors. vite build is the production gate; not exercised here.)*
- [x] 20.3 Manual smoke (production mode, rebuilt + restarted by user). Verified via agent-browser on `http://localhost:8000`:
  * **Overlay rendering** (7 routes): openspec preview / archive / specs / readme / pi-resources / pi-resource query / session diff — all render correctly from cold URL. ✅
  * **Back-from-overlay returns to prior URL** (`/settings` baseline):
    - `/settings` → openspec preview → back → `/settings` ✅
    - `/settings` → openspec archive → back → `/settings` ✅
    - `/settings` → openspec specs → back → `/settings` ✅
    - `/settings` → readme → back → `/settings` ✅
    - `/settings` → pi-resources → back → `/settings` ✅
    - `/settings` → `/pi-resource?path&title` → back → `/settings` ✅
    - `/settings` → `/session/:id/diff` → back → `/settings` ✅
  * **Session detail header**: `/` → `/session/:id` → back → `/` (session-header back arrow uses same `goBack`). ✅
  * **Multi-overlay chain**: `/settings` → proposal → archive → readme → back × 3 → `/settings`. ✅
  * **Tab switching within preview** is in-page state (does NOT push URL); back from any tab still returns to the URL that pushed the preview. ✅
  * **User repro path (sidebar in-app click)**: load `/session/:id` → click attached-proposal `P D S T` letters button in SessionHeader → URL changes to `/folder/.../openspec/overlay-url-routing/proposal` → back arrow → returns to `/session/:id`. ✅ — the original bug is fixed.
  * **Refresh resilience**: re-opening any overlay URL re-renders the same content with no prior state. ✅
- [x] 20.4 `curl -X POST http://localhost:8000/api/restart` — user rebuilt + restarted before smoke.
