## 1. Shared Types

- [x] 1.1 Add `PiResource`, `PiResourceScope`, `PiPackageInfo`, and `PiResourcesResult` types to `src/shared/rest-api.ts`
- [x] 1.2 Add `PiResourcesResponse` API response type

## 2. Server: Resource Scanner

- [x] 2.1 Create `src/server/pi-resource-scanner.ts` with `scanPiResources(cwd: string)` function — local `.pi/` discovery (extensions, skills, prompts)
- [x] 2.2 Add global `~/.pi/agent/` resource discovery to the scanner
- [x] 2.3 Add YAML frontmatter parsing for SKILL.md and prompt .md files (regex-based, extract `name` and `description`)
- [x] 2.4 Add package resolution from `settings.json` — npm packages (`npm root -g` + cache), git packages, local path packages
- [x] 2.5 Add `package.json` pi manifest reading and conventional directory fallback for packages
- [x] 2.6 Add package deduplication (local settings win over global)
- [x] 2.7 Write tests for `pi-resource-scanner.ts` covering local, global, package discovery, frontmatter parsing, and error cases

## 3. Server: REST Endpoint & Polling

- [x] 3.1 Add `GET /api/pi-resources?cwd=...` endpoint to `server.ts` (localhost-only, returns cached scan result)
- [x] 3.2 Add `GET /api/pi-resource-file?path=...` endpoint to `server.ts` (localhost-only, reads files from allowed pi resource locations)
- [x] 3.3 Integrate pi resource scanning into `DirectoryService` — cache, poll alongside OpenSpec, expose `getPiResources(cwd)` and `refreshPiResources(cwd)`
- [x] 3.4 Write tests for the new endpoints and DirectoryService integration

## 4. Client: PiResourcesView Component

- [x] 4.1 Create `src/client/components/PiResourcesView.tsx` — content area view with back button, grouped sections (Local, Global, Packages), resource cards with name/description/View button
- [x] 4.2 Create `src/client/hooks/usePiResources.ts` — fetch + 30s polling hook for `GET /api/pi-resources?cwd=...`
- [x] 4.3 Write tests for PiResourcesView component

## 5. Client: Navigation Integration

- [x] 5.1 Add `piResourcesView` state to `App.tsx` (parallel to `previewState`) and render PiResourcesView in content area
- [x] 5.2 Add stack navigation: PiResourcesView → MarkdownPreviewView for "View" action, with back returning to resources
- [x] 5.3 Add Pi Resources button to folder header in `SessionList.tsx` (alongside + Session / + Terminal buttons)
- [x] 5.4 Wire up file preview using `GET /api/pi-resource-file` for resource file reads (.md as markdown, .ts as code block)
- [x] 5.5 Add mobile support — MobileShell integration with slide transitions and swipe-back

## 6. Documentation

- [x] 6.1 Update `AGENTS.md` key files table with new files
- [x] 6.2 Update `docs/architecture.md` with pi resources scanning and endpoint documentation
