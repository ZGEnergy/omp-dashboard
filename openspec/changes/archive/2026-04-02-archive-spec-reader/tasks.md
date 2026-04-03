## 1. Server endpoint

- [x] 1.1 Add `GET /api/openspec-archive` route in `server.ts` that scans `openspec/changes/archive/` for the given cwd
- [x] 1.2 Return `{ success: true, data: ArchiveEntry[] }` where each entry has `name`, `date`, and `artifacts` (detected via file existence)
- [x] 1.3 Add tests for the archive scanning logic (empty dir, partial artifacts, full artifacts, missing dir)

## 2. Extend artifact reader for archive paths

- [x] 2.1 Add `archive?: boolean` parameter to `useOpenSpecReader` hook
- [x] 2.2 Update `fetchArtifactContent` to resolve paths under `openspec/changes/archive/<name>/` when archive is true
- [x] 2.3 Add tests for archive path resolution in `useOpenSpecReader`

## 3. Archive browser view

- [x] 3.1 Create `ArchiveBrowserView` component with search input, date-grouped entry list, and two-level navigation (archive list ↔ artifact reader)
- [x] 3.2 Add `useArchiveListing` fetch hook for the `/api/openspec-archive` endpoint
- [x] 3.3 Integrate `ArtifactLettersButton` on each entry row for artifact navigation
- [x] 3.4 Manage internal state so clicking an artifact opens the reader inline, and Back returns to the list (preserving search/scroll)
- [x] 3.5 Add tests for search filtering and date grouping logic

## 4. Wire into App.tsx and FolderOpenSpecSection

- [x] 4.1 Add `onOpenArchive` prop to `FolderOpenSpecSection` and render `[Archive]` button next to `[Specs]`
- [x] 4.2 Add `archiveBrowserCwd` state in `App.tsx` with content-area routing (desktop + mobile)
- [x] 4.3 Wire `onOpenArchive` callback from folder groups to set `archiveBrowserCwd`
- [x] 4.4 Pass `archive: true` to `useOpenSpecReader` when opening artifacts from the archive browser

## 5. Documentation

- [x] 5.1 Update AGENTS.md key files table with new components
- [x] 5.2 Update docs/architecture.md with archive browser data flow
