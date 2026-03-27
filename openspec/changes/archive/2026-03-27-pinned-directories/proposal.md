## Why

Directory groups in the sidebar are sorted by most recent session activity and disappear entirely when "Active only" is enabled and no active sessions exist. Users need certain project directories to remain visible and in a fixed position regardless of session activity — for monitoring, quick access, and spawning new sessions.

The existing Workspace system (`workspace-store.ts`, `WorkspaceBar.tsx`, `AddWorkspaceDialog.tsx`) was built to serve a similar purpose but was never connected to the client — it's dead code. Rather than reviving an unused abstraction, we replace it with a simpler "pinned directories" model.

## What Changes

- **Add pinned directories**: Users can pin directory groups so they always appear at the top of the sidebar in a user-defined order, even with zero sessions
- **Pinned directory ordering**: Pinned directories are drag-to-reorder, using the same `@dnd-kit` library already used for session cards
- **Pin/unpin from group headers**: Each directory group header gets a pin/unpin toggle button
- **Add pinned directory manually**: A UI to pin a directory path not currently visible (no running sessions)
- **BREAKING: Remove workspace system**: Delete `workspace-store.ts`, `WorkspaceBar.tsx`, `AddWorkspaceDialog.tsx`, workspace REST endpoints, `Workspace` type, `workspaceId` from `DashboardSession`, `workspace_updated` browser protocol message

## Capabilities

### New Capabilities
- `pinned-directories`: Server-side persistence and REST/WebSocket API for pinned directory list (ordered array of cwd strings in `state.json`)
- `pinned-directories-ui`: Client-side pinning controls, always-visible pinned groups, drag-to-reorder pinned groups, manual pin dialog

### Modified Capabilities
- `session-grouping`: Pinned groups appear first (in pinned order), unpinned groups appear below sorted by recency. Pinned groups with zero sessions still render.

## Impact

- **Server**: Remove `workspace-store.ts` and workspace endpoints. Add pinned directory fields to `state-store.ts`. Add REST endpoints for pin/unpin/reorder. Add WebSocket broadcast for pinned changes.
- **Shared types**: Remove `Workspace` interface and `workspaceId` from `DashboardSession`. Remove `workspace_updated` from browser protocol. Add `pinned_dirs_updated` message.
- **Client**: Remove `WorkspaceBar.tsx` and `AddWorkspaceDialog.tsx`. Update `SessionList.tsx` to split groups into pinned/unpinned sections with directory-level drag-and-drop for pinned section.
- **Persistence**: `~/.pi/dashboard/workspaces.json` becomes unused. Pinned dirs stored in existing `~/.pi/dashboard/state.json`.
- **Session manager**: Remove workspace matching logic from `memory-session-manager.ts`.
