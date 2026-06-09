## 1. Tests First (TDD)

- [x] 1.1 Add a test for `useOpenSpecReader` asserting the active artifact follows the `initialArtifact` prop: render with `initialArtifact="proposal"`, rerender with `initialArtifact="design"`, expect the content-load to target the design artifact (no remount).
- [x] 1.2 Add a test for `OpenSpecPreview` asserting a tab click calls `navigate(buildOpenSpecPreviewUrl(cwd, changeName, tabId))` with push (mock wouter `navigate`), not `reader.setActiveTab`.
- [x] 1.3 Add a test asserting that with the route at `.../my-change/design`, the rendered `MarkdownPreviewView` receives `activeTab="design"`.
- [x] 1.4 Run the suite and confirm the three new tests fail for the right reasons (`npm test 2>&1 | tee /tmp/pi-test.log`; grep for the new test names).

## 2. Derive activeTab from URL (Bug 2)

- [x] 2.1 In `packages/client/src/hooks/useOpenSpecReader.ts`, stop owning `activeTab` via one-time `useState(initialArtifact)`; treat `initialArtifact` as the active artifact (Decision 2A).
- [x] 2.2 Point the content-loading `useEffect` at `initialArtifact` so route-param changes reload content without a remount.
- [x] 2.3 Remove `setActiveTab` from the returned `OpenSpecReaderState` API and update the `activeTab` returned value to reflect `initialArtifact`.
- [x] 2.4 Grep for other `setActiveTab` / `reader.setActiveTab` consumers; confirm only `OpenSpecPreview` used it. (Also found `ArchiveBrowserView.tsx` — archive preview is local-state driven, not URL-routed; gave its inner reader local `activeArtifact` state feeding `initialArtifact`.)

## 3. Tab click drives the URL (Bug 1)

- [x] 3.1 In `packages/client/src/App.tsx`, obtain `navigate` in (or pass it into) `OpenSpecPreview`.
- [x] 3.2 Replace `onTabChange={reader.setActiveTab}` with `onTabChange={(tabId) => navigate(buildOpenSpecPreviewUrl(cwd, changeName, tabId))}` (push history).
- [x] 3.3 Feed `activeTab={initialArtifact}` (or `reader.activeTab` now derived from it) into `MarkdownPreviewView`.

## 4. Verify

- [x] 4.1 Run the full test suite; confirm the new tests pass and no existing tests regress (`npm test 2>&1 | tee /tmp/pi-test.log`; grep `FAIL|Error`).
- [x] 4.2 Type-check (`npm run reload:check` or `tsc`); confirm no type errors from the removed `setActiveTab`.
- [x] 4.3 Build + restart (`npm run build` → `curl -X POST http://localhost:8000/api/restart`); manually verify: switch P→D→S updates the URL, refresh keeps the artifact, browser Back walks artifacts, and clicking a different letter for the same change updates the visible tab.
- [x] 4.4 Verify archive preview (`archive` reader path) still tab-switches correctly.
- [x] 4.5 Run `openspec validate fix-openspec-artifact-tab-url-sync --strict` and confirm it passes.
