## Context

Directory groups in the sidebar currently display only the basename (`judo-ng`) and match pinned directories by exact string comparison against the session `cwd`. On macOS, `/Project` is a symlink to `/Users/robson/Project`, so `process.cwd()` resolves to the real path while users may pin the symlink path. This causes a mismatch: the pinned group appears empty and sessions land in a duplicate unpinned group. Additionally, pinned groups with zero sessions don't show editor buttons or spawn controls because those are derived only from session cwds.

## Goals / Non-Goals

**Goals:**
- Pinned directory paths are normalized to real paths so they always match session cwds
- All directory group headers show the full absolute path, not just the basename
- Long paths are middle-truncated to fit available space (e.g., `/Users/robson/Project…/judo-meta-esm`)
- Pinned groups with zero sessions show editor buttons and "New" spawn button

**Non-Goals:**
- Resolving symlinks on the extension/agent side (already resolved by `process.cwd()`)
- Changing how sessions report their cwd
- Displaying the symlink path instead of the resolved path

## Decisions

### 1. Normalize paths server-side with `fs.realpathSync`

**Decision**: Call `fs.realpathSync()` in the server's `pin_directory` and `reorder_pinned_dirs` handlers before storing.

**Rationale**: The server is the single point where pinned paths are persisted. Normalizing here ensures consistency regardless of what the client sends. The extension already reports resolved paths via `process.cwd()`, so only the pinned side needs fixing.

**Alternative considered**: Normalize on the client before sending — rejected because the browser has no filesystem access and the PinDirectoryDialog accepts user-typed paths.

### 2. Middle-truncation utility for path display

**Decision**: Create a pure function `truncatePathMiddle(path: string, maxLen: number): string` in a shared client utility. It preserves the first path segment(s) and the last segment (directory name), replacing the middle with `…`.

**Algorithm**:
- If `path.length <= maxLen`, return as-is
- Split path into segments
- Always keep the last segment (the directory name)
- Keep as many leading segments as fit within `maxLen`, replacing the rest with `…`
- Example: `truncatePathMiddle("/Users/robson/Project/some/deep/judo-meta-esm", 35)` → `/Users/robson/Project…/judo-meta-esm`

**Rationale**: CSS `text-overflow: ellipsis` only truncates at the end, losing the most important part (the directory name). A custom function gives control over what's preserved.

### 3. Include pinned cwds in editor detection

**Decision**: Extend the `cwds` list passed to `useEditors` to include pinned directory paths, not just cwds from active sessions.

**Rationale**: `useEditors` queries the server for available editors per cwd. Currently it only includes cwds from sessions, so empty pinned groups get no editor buttons. Adding pinned cwds to the input list is a one-line change.

### 4. Show spawn button for empty pinned groups

**Decision**: The "New" button already renders for all groups via `renderGroup`. No change needed — it's gated on `onSpawnSession` being defined, not on session count. Once the symlink fix resolves the duplicate-group issue, this will work correctly for pinned groups with sessions too.

## Risks / Trade-offs

- **`realpathSync` failure**: If the path doesn't exist on disk, `realpathSync` throws. → Mitigation: wrap in try/catch, fall back to the original path. A pinned directory that doesn't exist locally (e.g., remote machine) should still work as a string match.
- **Middle-truncation heuristic**: A fixed `maxLen` may not match the actual pixel width due to variable-width fonts. → Mitigation: Use a generous default (e.g., 40-50 chars) and CSS `truncate` as a secondary fallback. Can be refined later.
- **Editor detection for non-existent directories**: Querying editors for a pinned cwd that doesn't exist on the current machine will return empty. → Acceptable: same behavior as today, just no editor buttons shown.
