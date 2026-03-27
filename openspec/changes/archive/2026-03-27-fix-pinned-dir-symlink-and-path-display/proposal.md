## Why

Pinned directories break when the path contains symlinks. `process.cwd()` returns the resolved (real) path (e.g., `/Users/robson/Project/judo-ng`), but users may pin through a symlink (e.g., `/Project/judo-ng`). The string mismatch causes the same directory to appear twice in the sidebar — once as an empty pinned group and once as an unpinned group with the session. Additionally, directory groups currently show only the basename (e.g., `judo-ng`), making it hard to distinguish similarly-named directories across different parent paths. Finally, pinned directory groups with zero sessions are missing details (editors, git info) that unpinned groups show, because those details are derived from sessions.

## What Changes

- **Resolve symlinks on pin**: When the server receives a `pin_directory` or `reorder_pinned_dirs` message, resolve each path with `fs.realpathSync()` before storing. This ensures pinned paths always match the resolved `cwd` reported by agents.
- **Show full paths in group headers**: Replace basename-only display (e.g., `judo-ng`) with full absolute paths for both pinned and unpinned directory groups.
- **Middle-truncate long paths**: When the full path is too long for the available space, truncate from the middle with ellipsis, preserving the root prefix and the trailing directory name. For example: `/Users/robson/Project…/judo-meta-esm`.
- **Pinned groups show all group details**: Pinned directory groups SHALL show the same details as unpinned groups — git branch/PR links, editor buttons (e.g., Zed), and "New" spawn button — even when the pinned group has zero sessions. The `useEditors` hook and editor detection must include pinned directory cwds in its query list, not just cwds derived from active sessions.

## Capabilities

### New Capabilities

- `directory-path-display`: Full-path display with middle truncation for directory group headers in the session sidebar.

### Modified Capabilities

- `session-grouping`: The "directory name" display in group headers changes from basename-only to full path with middle truncation. Pinned groups with zero sessions must show editor buttons and "New" spawn button.

## Impact

- **Server** (`src/server/browser-gateway.ts`): Add `realpathSync` normalization when processing `pin_directory` and `reorder_pinned_dirs` messages.
- **Server** (`src/server/state-store.ts`): Optionally normalize in `pinDirectory()` as defense-in-depth.
- **Client** (`src/client/components/SessionList.tsx`): Replace `group.cwd.split("/").pop()` with full path display using a middle-truncation utility. Include pinned directory cwds in the `useEditors` hook input so editors are detected for empty pinned groups.
- **Client**: New utility function for middle-truncating filesystem paths.
- **Specs**: `session-grouping` spec requirement for "directory name" display needs updating to reflect full-path behavior and pinned group parity.
