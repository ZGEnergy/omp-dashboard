## Context

The dashboard displays session chat views but provides no visibility into what files a session has actually changed. Users must leave the dashboard to run `git diff` or manually remember what was modified. The event system already captures `tool_execution_start` events with tool names (Write, Edit, Bash) and their arguments (including file paths and edit content), so the raw data is available.

Existing patterns to follow:
- Content-area views: `previewState`, `piResourcesState`, `specsBrowserCwd` all replace the ChatView area and use a back button to return
- Git operations: `src/server/git-operations.ts` uses `execSync` with timeout for git commands
- REST endpoints: `server.ts` defines Fastify routes, often localhost-guarded
- Event store: `memory-event-store.ts` provides `getEvents(sessionId, minSeq)` returning all stored events

## Goals / Non-Goals

**Goals:**
- Show a file tree of all files changed during a session, derived from session events
- Each file in the tree shows its individual change events with timestamps and context (the assistant message explaining the change)
- Selecting a specific change event shows that particular change (Edit → oldText/newText diff, Write → full content)
- Optionally enrich with `git diff HEAD` when available (active sessions in git repos)
- Support both split (side-by-side) and unified diff modes via `@git-diff-view/react`
- Allow toggling to view the current file content with syntax highlighting
- Hide the button when no file changes are detected in the session

**Non-Goals:**
- Real-time streaming of diffs as they happen (manual refresh is sufficient)
- Tracking changes from bash commands at the file level (only Write/Edit tool events)
- Files outside the session cwd (absolute paths outside cwd are ignored)
- Persisting diff data — it's computed on demand from events + optional git
- Inline editing or reverting changes from the diff view
- Supporting binary file diffs

## Decisions

### 1. Event-first strategy: changes come from session events, git is optional enrichment

**Decision**: The primary data source is session events. Scan `tool_execution_start` events for Write/Edit tools to build the file change list with per-change detail. When available (active session in a git repo), augment with `git diff HEAD` for an aggregate diff view.

**Why**: Events are always available — even for old/ended sessions where the working directory may have changed since. Git diffs are only reliable for currently active sessions. This also directly addresses the requirement to show individual changes with timestamps.

**Data available per tool event:**
- **Edit tool**: `args.path`, `args.edits[]` (each with `oldText` and `newText`) → can generate a per-change diff
- **Write tool**: `args.path`, `args.content` → show as "file created/overwritten" with full content as additions
- **Both**: `timestamp` from the event, and the preceding assistant `message_end` content provides the "reason" context

**Alternative considered**: Git-first with event enrichment. Rejected because git diffs aren't available for old sessions, and the user specifically wants per-event change granularity with timestamps.

### 2. Use `@git-diff-view/react` with `@git-diff-view/lowlight`

**Decision**: Use `@git-diff-view/react` (39K weekly downloads, v0.1.3) for diff rendering with `@git-diff-view/lowlight` for syntax highlighting.

**Why**: GitHub-style UI out of the box, supports split+unified modes, dark/light themes. Supports both git diff format (for aggregate diffs) and file comparison mode (for event-based old/new content diffs). The lowlight highlighter uses highlight.js (no WASM needed).

**Alternative considered**: `react-diff-viewer-continued` — simpler but less actively maintained, no built-in syntax highlighting. Monaco diff editor — too heavy.

### 3. Two-level file tree: files → changes

**Decision**: The file tree shows changed files at the top level. Expanding a file reveals its individual change events as child nodes, each with a timestamp and brief context. Selecting a change node shows that specific change in the diff panel. Selecting the file node itself shows either the aggregate git diff (if available) or the most recent change.

**Why**: This gives both the "what files changed" overview and the "what happened when" drill-down that the user requested. The tree structure is familiar from IDE file explorers.

### 4. Server returns structured change events, not pre-computed diffs

**Decision**: The REST endpoint returns the raw change data (file paths, event timestamps, Edit oldText/newText, Write content, preceding message excerpt) and lets the client compute diffs using `@git-diff-view/file` (file comparison mode). Optionally includes a `gitDiff` field with the aggregate `git diff HEAD` output per file when available.

**Why**: Keeps the server simple (just event scanning + optional git), avoids server-side diff computation for Edit events. The `@git-diff-view/file` package can diff two strings client-side efficiently. Also reduces payload — Edit events already carry the exact changes.

### 5. Content-area view pattern with button visibility tied to changes

**Decision**: The diff view replaces the ChatView area when activated, following the same pattern as `previewState`, `piResourcesState`, etc. The "Changed Files" button appears in SessionHeader before the Fork button (right-aligned). The button is only shown when the session has detected file changes (from events). For old sessions, changes are detected from replayed events.

**Why**: Consistent UX, minimal App.tsx changes. Hiding when no changes avoids clutter. Right-aligned placement next to Fork keeps action buttons grouped.

### 6. Filter out files outside cwd

**Decision**: File paths from Write/Edit events are resolved relative to the session cwd. Absolute paths that fall outside the cwd are excluded from the file tree.

**Why**: Files outside the project directory (e.g., `/tmp/` scratch files) are noise and would break git diff lookups.

## Risks / Trade-offs

- **[Risk] Edit args may be truncated for large edits** → If the event data truncates large `oldText`/`newText` values, the diff may be incomplete. Mitigation: show a "content truncated" indicator; the git aggregate diff provides the full picture when available.
- **[Risk] Write tool doesn't capture "before" state** → Can only show the written content as all-additions. Mitigation: acceptable — Write means "create or overwrite", showing the new content is useful. Git aggregate diff shows the actual delta when available.
- **[Risk] Event store eviction loses change history** → Old events may be evicted from memory. Mitigation: for ended sessions, events are replayed from session files on subscribe, so the data is recoverable.
- **[Risk] Assistant message context extraction is imperfect** → The "reason" for a change comes from the most recent assistant message before the tool call. If there are multiple tool calls in sequence, context may be shared. Mitigation: show a truncated excerpt; the timestamp is the primary identifier.
- **[Trade-off] Bundle size increase** → `@git-diff-view/react` + `@git-diff-view/lowlight` + `@git-diff-view/file` add to the client bundle. Acceptable for a dev tool.
