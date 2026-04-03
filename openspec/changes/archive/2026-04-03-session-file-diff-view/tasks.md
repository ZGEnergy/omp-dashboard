## 1. Dependencies & Types

- [x] 1.1 Install `@git-diff-view/react`, `@git-diff-view/core`, `@git-diff-view/file`, and `@git-diff-view/lowlight` as dependencies
- [x] 1.2 Add shared types for the session diff API (`FileChangeEvent`, `FileDiffEntry`, `SessionDiffResponse`) in a new `src/shared/diff-types.ts`

## 2. Server: Diff Extraction

- [x] 2.1 Create `src/server/session-diff.ts` with `extractFileChanges(events, cwd)` — scans `tool_execution_start` events for Write/Edit tools (case-insensitive), extracts path + tool-specific data (edits/content) + timestamp, filters out paths outside cwd, deduplicates and groups by file path, extracts preceding assistant message as context
- [x] 2.2 Add `enrichWithGitDiff(cwd, filePaths)` in same module — runs `git diff HEAD -- <path>` per file when in a git repo, returns map of path → unified diff string, gracefully returns empty on git errors
- [x] 2.3 Add `GET /api/session-diff?sessionId=xxx` route in `server.ts` (localhost-guarded) — looks up session, loads events from event store, calls `extractFileChanges` + `enrichWithGitDiff`, returns `SessionDiffResponse`
- [x] 2.4 Write tests for `extractFileChanges` (Write/Edit detection, case-insensitive, dedup, outside-cwd filtering, message context extraction) and `enrichWithGitDiff` (git available/unavailable)

## 3. Client: Changed Files Detection

- [x] 3.1 Add `hasFileChanges` derived field to the event reducer or a utility — scans session messages/toolCalls for Write/Edit tool names to determine if the "Changed Files" button should be visible

## 4. Client: Data Hook

- [x] 4.1 Create `src/client/hooks/useSessionDiff.ts` — fetches `/api/session-diff?sessionId=xxx`, returns `{ data: SessionDiffResponse | null, isLoading, error, refresh }`

## 5. Client: File Tree Component

- [x] 5.1 Create `src/client/components/DiffFileTree.tsx` — two-level tree with file nodes (status indicator, change count) and expandable change event children (timestamp, context message), directory grouping, file/change selection callbacks, aggregate stats summary
- [x] 5.2 Write tests for tree building logic (grouping files by directory, sorting, change event ordering)

## 6. Client: Diff Panel Component

- [x] 6.1 Create `src/client/components/DiffPanel.tsx` — wraps `@git-diff-view/react` DiffView with lowlight highlighting; handles three display modes: (a) Edit change → file comparison mode with oldText/newText, (b) Write change → all-additions view, (c) git aggregate diff → git diff mode; includes split/unified toggle and diff/file-content toggle
- [x] 6.2 Add file content fetching for "File" view mode using existing `/api/pi-resource-file` endpoint

## 7. Client: Main View & Integration

- [x] 7.1 Create `src/client/components/FileDiffView.tsx` — split-pane container composing DiffFileTree + DiffPanel, handles file/change selection state, loading/empty/error states, refresh button, mobile stacked layout
- [x] 7.2 Add `diffViewSessionId` state to `App.tsx` and wire up the content-area view pattern (replaces ChatView when active, back button to return, clears on session change)
- [x] 7.3 Add "Changed Files" button to `SessionHeader.tsx` — right-aligned before Fork button, only visible when `hasFileChanges` is true, activates the diff view
- [x] 7.4 Support mobile layout in MobileShell depth system

## 8. Documentation

- [x] 8.1 Update `AGENTS.md` key files table with new components and modules
- [x] 8.2 Update `docs/architecture.md` with session diff API endpoint documentation
