## Context

The dashboard has an existing OpenSpec artifact reader (`useOpenSpecReader` + `MarkdownPreviewView`) that opens active change artifacts in a tabbed content-area view. The `FolderOpenSpecSection` shows active changes with artifact letter buttons (P D S T) and a "Specs" button for main specs. Archived changes live under `openspec/changes/archive/<date-slug>/` with the same structure as active changes but are currently inaccessible from the UI. There are ~97 archived entries and growing.

## Goals / Non-Goals

**Goals:**
- Let users browse and read archived OpenSpec changes from the dashboard
- Searchable, date-grouped selection UI that scales to hundreds of entries
- Reuse existing artifact reader infrastructure (minimal new code)

**Non-Goals:**
- Editing or restoring archived changes
- Full-text search across archive content (search is by change name only)
- Archive management (delete, re-archive) from the UI

## Decisions

### 1. Dedicated server endpoint over `/api/file` directory listing
**Decision**: New `GET /api/openspec-archive?cwd=<path>` endpoint that returns structured archive entry data.
**Rationale**: The `/api/file` endpoint would require multiple round-trips (list dir, then read each `.openspec.yaml`). A dedicated endpoint returns all metadata in one call — name, date, and artifact list per entry. This keeps the client simple.
**Alternative**: Chain `/api/file` calls from the client. Rejected: too many requests, duplicates server logic on client.

### 2. Reuse `useOpenSpecReader` with archive path flag
**Decision**: Add an optional `archive?: boolean` parameter to `useOpenSpecReader`. When true, `fetchArtifactContent` resolves paths under `openspec/changes/archive/<name>/` instead of `openspec/changes/<name>/`.
**Rationale**: The archive artifacts have identical structure to active ones. The only difference is the filesystem path. A single boolean flag avoids duplicating the entire reader.
**Alternative**: Separate `useArchiveSpecReader` hook. Rejected: would duplicate ~100 lines for a one-line path difference.

### 3. `ArchiveBrowserView` as a content-area view
**Decision**: New `ArchiveBrowserView` component follows the same pattern as `SpecsBrowserView` — a content-area view with back button, driven by `archiveBrowserCwd` state in App.tsx.
**Rationale**: Consistent with existing content-area views. The state management pattern is proven.

### 4. Selection UI: searchable list grouped by day
**Decision**: Display entries grouped by date (extracted from the `YYYY-MM-DD-` prefix), newest-first. A text input at the top filters entries by slug name. Each entry row shows artifact letter buttons (P D S T) using the existing `ArtifactLettersButton` component.
**Rationale**: Users typically search by feature name, not date. Date grouping provides visual structure without overwhelming (most days have 1-5 entries). Reusing `ArtifactLettersButton` keeps interaction consistent with active changes.

### 5. Entry point: `[Archive]` button in `FolderOpenSpecSection`
**Decision**: Place the Archive button next to the existing `[Specs]` button in the folder OpenSpec header.
**Rationale**: Natural discovery — users already look at this section for OpenSpec navigation. No new navigation concepts needed.

## Risks / Trade-offs

- **[Large archive dirs]** → Scanning 100+ directories on each request could be slow. Mitigation: The endpoint only reads directory names (no file I/O needed for the listing since date and slug are in the name). Artifact detection uses `fs.stat` checks, not full reads.
- **[No caching]** → Archive list is fetched fresh each time. Mitigation: Archives rarely change (only after bulk-archive). If it becomes a problem, add a simple cache with TTL later.
