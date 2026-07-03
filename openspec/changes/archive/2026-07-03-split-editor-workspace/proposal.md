# Split Editor Workspace

## Why

Today the internal Monaco editor pane (`add-internal-monaco-editor-pane`, archived
2026-06-30) and `ChatView` are **mutually exclusive** — the content router renders
either `/session/:id` (chat) **or** `/session/:id/editor` (pane), never both. To read
a file the agent just touched, the user leaves the conversation entirely.

Users want chat and editor **side-by-side**: keep the conversation visible while
reading the code under discussion. Three concrete gaps block that:

1. **No split, no inner resize.** The editor replaces chat instead of co-existing.
   There is no split/unsplit affordance and no resizable divider between chat and
   editor. Inside the pane, the file-browse rail is fixed-width (not resizable), only
   collapsible.
2. **Editor search is missing.** The pane has a lazy file-tree rail but no way to
   *search* for a file by name (regexp / type-ahead) or to grep file **contents**.
   No `/api/grep`-style endpoint exists anywhere in the server.
3. **The `@`-mention search silently drops files.** Even after the ranking fix
   (`fix-file-mention-search-ranking`, archived 2026-06-05), `searchFiles` walks
   the tree per request bounded by `MAX_VISITS = 4000` and `depth ≤ 6`, and ignores
   `.gitignore`. In this monorepo the budget is exhausted before the walk reaches
   later top-level subtrees, so matching files past the horizon never appear. The
   prior change **acknowledged** this as a known budget limit; it was not addressed.

Users also want the editor **pinned to the session** (root = session `cwd`, open
files remembered per session) and a **signal when a cached file changes on disk**
(e.g. the agent edits a file the user has open) — without silently clobbering their
scroll position.

Mockups for every state (split/unsplit, resizable divider, dual-mode search with
type-ahead, changed-on-disk banner, desktop + mobile-stacked, dark + light) live in
`mockups/index.html` and are part of this proposal.

## What Changes

- **ADDED** capability `split-editor-workspace`: the content area SHALL host a
  `ChatView` + editor split. A split/unsplit toggle SHALL live in the session
  header; a draggable divider SHALL resize the two panes; a **second** draggable
  divider inside the editor pane SHALL resize the file-browse rail against the viewer,
  independently of the outer split; the split ratio, rail width, open state, and
  orientation SHALL persist per session in `localStorage`. On desktop the
  split is horizontal (chat left / editor right); below the mobile breakpoint it
  stacks vertically (chat top / editor bottom) with a row-resize divider.
  **Opening a file** (chat file-link, tool-result path, tree click, search result)
  SHALL auto-open the split when it is closed, then open the file in the pane.

- **ADDED** capability `editor-file-search`: the pane SHALL host a search panel with
  two modes — **Filenames** (path search, substring or regexp, type-ahead) and
  **Contents** (regexp/literal grep across file bodies). Filename search reuses the
  bridge walk; content search calls a **new** `GET /api/grep` endpoint that shells to
  `ripgrep` when available and falls back to a bounded JS scan. Both modes require a
  minimum query length (default 3 chars) and are debounced. Results are keyboard
  navigable (`↑↓`, `↵` opens, `Esc` closes); opening a result auto-splits if needed.

- **MODIFIED** capability `file-autocomplete`: `searchFiles` in the bridge SHALL
  (a) require a **minimum 3-character** leaf before firing a walk (bare `@` still
  lists top-level entries), (b) become **`.gitignore`-aware** so ignored trees stop
  consuming the visit budget, and (c) **soften the completeness caps** (raise
  `MAX_VISITS`, relax the depth guard) so large repos no longer drop matches past the
  horizon. An optional regexp leaf mode is added. Wire shape unchanged.

- **MODIFIED** capability `internal-monaco-editor-pane`: the pane SHALL be mountable
  **inside the split** (co-existing with `ChatView`), not only as a full-screen route
  swap. The file-browse rail SHALL become **resizable** (draggable rail↔viewer
  divider, clamped, width persisted) in addition to its existing collapsible behaviour. The existing `/session/:id/editor` route is retained as a deep-link that opens
  the split. A **changed-on-disk banner** SHALL appear when an open file changes on
  disk (agent edit or external change), driven by a narrow server-side watch of the
  session's *open* files; the banner offers **Refresh** but does **not** auto-reload
  (preserving the read-only-v1 no-auto-refresh decision — this adds the *signal*, not
  the forced reload).

- **NOT INTRODUCED — persistent file index.** The `fix-file-mention-search-ranking`
  change explicitly deferred "server-side caching or an index." This proposal
  **respects that decision**: filename search stays a per-request walk (tuned), and
  content search is a fresh `ripgrep` scan (inherently un-cached). A persistent
  watched index is noted in `design.md` as the escalation path if grep latency ever
  bites, but is **out of scope** here. See `design.md` §"Search substrate".

- **NOT INTRODUCED — editor write/save.** The pane stays read-only (v1 decision). The
  changed-on-disk banner and refresh do not introduce editing.

- **NOT INTRODUCED — whole-tree file watcher.** The change-notification watch is
  scoped to the *currently open* files per session, not the entire `cwd` tree.

## Capabilities

### Added Capabilities
- `split-editor-workspace`: chat + editor split layout, resizable divider,
  unsplit/re-split toggle, auto-split-on-open, per-session persisted split state,
  responsive stacking.
- `editor-file-search`: dual-mode (filename regexp / content grep) search panel with
  type-ahead, min-3-char debounce, keyboard navigation, and the `GET /api/grep`
  content-search endpoint.

### Modified Capabilities
- `file-autocomplete`: min-3-char guard, `.gitignore`-aware walk, softened
  completeness budget, optional regexp leaf.
- `internal-monaco-editor-pane`: split-hosted mounting alongside `ChatView`;
  changed-on-disk banner driven by an open-files watch.

## Impact

- **ADDED files** (client): `SplitWorkspace.tsx` (content-area split wrapper),
  `SplitDivider.tsx` + `useSplitRatio.ts` (drag logic extracted from
  `ResizableSidebar`), `EditorSearchPanel.tsx`, `split-state.ts` (per-session
  localStorage). Editor-pane files (`EditorPane.tsx`, `EditorFileTree.tsx`) gain a
  `mode="split"` path and a changed-on-disk banner.
- **ADDED files** (server): `browser-handlers/grep-handler.ts` (or `/api/grep`
  route) + a `ripgrep` detection helper; an open-files watch wired into the session
  file infrastructure emitting a `file_changed` event.
- **MODIFIED files**: `packages/extension/src/command-handler.ts` (`searchFiles`:
  min-3, `.gitignore`, softened budget, regexp) — bridge change, requires
  `npm run reload`. `App.tsx` content router (render split instead of route swap;
  auto-split on open). `OpenFileButton.tsx` / `FileLink` / `useFileOpenRouting.ts`
  (open into split instead of full route swap). Spec deltas for the four capabilities.
- **Tests**: split toggle + persistence, divider clamp + ratio persistence,
  auto-split-on-open, responsive stacking; `/api/grep` (ripgrep + JS fallback + path
  containment); `searchFiles` min-3 + gitignore + softened budget + regexp; changed-
  on-disk banner fires on watch event, refresh re-fetches, no auto-reload.
- **Backward compatibility**: `/session/:id/editor` route retained (opens split).
  `@`-mention wire shape unchanged. Read-only pane unchanged. Existing
  `editor-pane-state` localStorage reused for open-file persistence.

## References

- Mockups: `openspec/changes/split-editor-workspace/mockups/index.html`
  (serve via `serve_mockup`; toggles for every state).
- Prior art (archived): `2026-06-30-add-internal-monaco-editor-pane`,
  `2026-06-05-fix-file-mention-search-ranking`, `2026-03-23-resizable-sidebar`.
- Reuse: `packages/client/src/components/ResizableSidebar.tsx` (drag-to-resize),
  `packages/client/src/lib/editor-pane-state.ts` (per-session localStorage),
  `packages/shared/src/file-kind.ts` (viewer classifier).
- Root cause of `@`-miss: `packages/extension/src/command-handler.ts` —
  `MAX_VISITS = 4000` (line 25), `depth > 6` (line 82), `IGNORE_DIRS` (line 20).
