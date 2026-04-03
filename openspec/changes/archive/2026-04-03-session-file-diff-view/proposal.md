## Why

When working with a pi session, there's no way to see what files were changed and what the actual modifications look like. Users must mentally track changes or switch to a terminal to run `git diff`. A built-in file diff viewer would give immediate visibility into session impact — like a GitHub PR diff view embedded in the dashboard.

## What Changes

- Add server-side logic to extract changed file paths from session events (Write/Edit/Bash tool calls) and combine with `git diff` / `git status` to produce per-file unified diffs
- Add a REST endpoint `GET /api/session-diff` that returns the file tree and diffs for a session
- Add a new content-area view with a split layout: file tree on the left, rich diff viewer on the right
- Integrate `@git-diff-view/react` with `@git-diff-view/lowlight` for GitHub-style diff rendering with syntax highlighting
- Support toggling between diff view (side-by-side or unified) and current file content view
- File tree shows change status indicators (added, modified, deleted) and aggregate stats (+/- lines)
- Accessible from a "Changed Files" button in the session header

## Capabilities

### New Capabilities
- `session-diff-extraction`: Server-side logic to scan session events for file-modifying tool calls, run `git diff HEAD` per file, and return structured diff data via REST API
- `file-diff-view`: Split-pane content-area view with collapsible file tree (left) and rich diff/content viewer (right), using `@git-diff-view/react` for GitHub-style rendering with syntax highlighting

### Modified Capabilities
<!-- No existing spec-level requirements are changing -->

## Impact

- **New dependencies**: `@git-diff-view/react`, `@git-diff-view/core`, `@git-diff-view/lowlight` (client-side)
- **Server**: New REST endpoint in `server.ts`, new `session-diff.ts` module (reuses patterns from `git-operations.ts`)
- **Client**: New components in `src/client/components/`, new hook `useSessionDiff.ts`
- **App.tsx**: New content-view state (same pattern as `previewState`, `piResourcesState`, `specsBrowserCwd`)
- **SessionHeader**: New "Changed Files" button trigger
- **No protocol changes**: Pure REST API, no WebSocket additions
- **No bridge changes**: All data already flows through existing events
