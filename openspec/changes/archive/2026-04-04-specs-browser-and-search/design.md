## Context

The dashboard has a `MarkdownPreviewView` component used for reading OpenSpec change artifacts (proposal, design, specs, tasks). The `useOpenSpecReader` hook fetches change-level spec files and concatenates them. The folder-level `FolderOpenSpecSection` contains a Bulk Archive button and a collapsible change list. Session-level `SessionOpenSpecActions` shows attach/detach and state-driven action buttons.

There are 107+ main specs in `openspec/specs/` with no dashboard browsing capability. The `/api/file` endpoint already supports both file reads and directory listings.

## Goals / Non-Goals

**Goals:**
- Move Bulk Archive to session cards where it's contextually relevant
- Provide a specs browser for the main `openspec/specs/` directory from the folder header
- Add reusable fuzzy text search to all markdown preview views

**Non-Goals:**
- Editing specs from the dashboard
- Server-side search or indexing — all search happens client-side on fetched content
- Lazy loading of individual specs (all are fetched upfront for search)

## Decisions

### D1: Bulk Archive placement — session action row

Move `[Bulk Archive]` from `FolderOpenSpecSection` header to `SessionOpenSpecActions` action buttons row. Show it only when `changes.some(c => c.status === "complete")`.

**Rationale**: Users interact with changes at the session level. The folder header is less discoverable. The button still runs `openspec_bulk_archive` with the session's `cwd`, same server behavior.

**Alternative considered**: Keep in both places. Rejected — adds clutter without benefit.

### D2: Specs browser entry point — folder header button

Add a `[Specs]` button on the right side of the `FolderOpenSpecSection` collapsible header (next to Refresh, replacing Bulk Archive's spot). Clicking opens a `SpecsBrowserView` in the content area (same slot as `MarkdownPreviewView`).

**Rationale**: Specs are per-directory, so the folder header is the natural entry point. Right-side placement keeps it visually separate from the change count on the left.

### D3: Specs concatenation with heading anchors

Reuse the pattern from `useOpenSpecReader.fetchArtifactContent("specs")`: fetch `openspec/specs/` directory listing, then fetch each `{specName}/spec.md` in parallel. Concatenate with `# {specName}` headings. Each heading gets a DOM id (`spec-{specName}`) for scroll-to.

**New hook**: `useMainSpecsReader(cwd)` — returns `{ specNames, content, isLoading, error }`. `specNames` is the sorted directory listing for the combobox.

**Rationale**: Reuses existing `/api/file` endpoint. Parallel fetching keeps load time reasonable even for 100+ specs.

### D4: Combobox for spec navigation

A `<select>` or searchable dropdown at the top of the specs browser listing all spec names alphabetically. On selection, calls `document.getElementById('spec-{name}')?.scrollIntoView({ behavior: 'smooth' })`.

**Rationale**: Simple, no external dependency needed. The combobox itself doesn't need fuzzy search — the separate search bar handles that.

### D5: Fuzzy search with fuse.js

Add `fuse.js` as a dependency. New `MarkdownSearch` component:

1. Extract text content from the rendered markdown container via `innerText` split into paragraphs/sections
2. Build a fuse.js index on mount and when content changes
3. On search input, get matching sections and their text snippets
4. Highlight matches using `<mark>` elements via DOM manipulation on the markdown container
5. Prev/next buttons navigate between highlights with `scrollIntoView`

**Integration**: `MarkdownPreviewView` gains an optional `searchable` prop. When true, renders the search bar in the header. The search component receives a ref to the content container.

**Alternative considered**: Browser native `window.find()`. Rejected — no fuzzy matching, inconsistent across browsers.

### D6: Search UI — inline header bar

The search bar lives in the `MarkdownPreviewView` header between the title and content. Always visible when `searchable=true` (no Ctrl+F toggle needed). Shows match count and prev/next arrows.

```
┌─────────────────────────────────────────────────┐
│  ← Back    Main Specs   🔍 [search...] 3/12 ▲▼ │
└─────────────────────────────────────────────────┘
```

**Rationale**: Simpler than a toggle overlay. For spec browsing, search is a primary interaction, not a secondary one.

## Risks / Trade-offs

- **[107+ parallel fetches]** → Acceptable: files are small (1-3KB each), `/api/file` is local. Could add a dedicated batch endpoint later if needed.
- **[fuse.js bundle size]** → ~15KB gzipped. Acceptable for a dashboard app.
- **[DOM manipulation for highlights]** → Fragile if markdown rendering changes. Mitigated by using a stable container ref and clearing highlights on each search.
- **[Bulk Archive visibility]** → Users who relied on the folder button need to find it on session cards. Mitigated by showing it on all sessions when completed changes exist.
