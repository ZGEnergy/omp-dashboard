## Why

Archived OpenSpec changes contain valuable design history and decision records, but there's no way to browse them from the dashboard. Users must manually navigate the filesystem. Adding an archive reader lets users look up past decisions, reference prior designs, and understand how features evolved — all from the same UI they already use for active changes.

## What Changes

- Add a dedicated server endpoint `GET /api/openspec-archive` that lists archived changes with their artifact metadata
- Add an `[Archive]` button in `FolderOpenSpecSection` (next to the existing `[Specs]` button), visible only when OpenSpec is initialized
- Add a new `ArchiveBrowserView` content-area component: searchable list of archived changes grouped by date (newest-first), with artifact letter buttons (P D S T) on each row
- Reuse the existing `useOpenSpecReader` hook with a path tweak to read from `openspec/changes/archive/<name>/` instead of `openspec/changes/<name>/`
- Add `archiveBrowserCwd` state in `App.tsx` to drive the content area (same pattern as `specsBrowserCwd`)

## Capabilities

### New Capabilities
- `openspec-archive-browser`: Searchable archive listing UI with date grouping and artifact navigation

### Modified Capabilities
- `openspec-folder-section`: Add Archive button entry point alongside existing Specs button
- `openspec-artifact-reader`: Support reading artifacts from archive path (`openspec/changes/archive/<name>/`)

## Impact

- **Server**: New REST endpoint in `server.ts` that scans `openspec/changes/archive/` directory
- **Client**: New `ArchiveBrowserView` component, state wiring in `App.tsx` and `MobileShell`
- **Shared**: Minor tweak to `useOpenSpecReader` to accept archive flag for path resolution
- **No breaking changes**: Additive only
