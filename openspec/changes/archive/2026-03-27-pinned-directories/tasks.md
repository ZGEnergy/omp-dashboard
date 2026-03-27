## 1. Remove workspace system

- [x] 1.1 Remove `Workspace` interface from `src/shared/types.ts` and `workspaceId` from `DashboardSession`
- [x] 1.2 Remove `WorkspaceUpdatedMessage` and `Workspace` import from `src/shared/browser-protocol.ts`
- [x] 1.3 Remove workspace references from `src/shared/rest-api.ts`
- [x] 1.4 Remove workspace matching logic from `src/server/memory-session-manager.ts`
- [x] 1.5 Remove workspace store usage and REST endpoints from `src/server/server.ts`
- [x] 1.6 Delete `src/server/workspace-store.ts` and its tests
- [x] 1.7 Delete `src/client/components/WorkspaceBar.tsx` and `src/client/components/AddWorkspaceDialog.tsx`
- [x] 1.8 Verify build and tests pass after workspace removal

## 2. Server-side pinned directory persistence

- [x] 2.1 Add `pinnedDirectories: string[]` to `StateData` in `state-store.ts` with `getPinnedDirectories`, `setPinnedDirectories` methods
- [x] 2.2 Add `pinDirectory(path)`, `unpinDirectory(path)`, `reorderPinnedDirs(paths[])` helper methods to `state-store.ts` (handle dedup, no-op on missing)
- [x] 2.3 Write tests for pin/unpin/reorder/persistence in state-store

## 3. WebSocket protocol for pinned directories

- [x] 3.1 Add `PinDirectoryMessage`, `UnpinDirectoryMessage`, `ReorderPinnedDirsMessage` to browser→server messages in `browser-protocol.ts`
- [x] 3.2 Add `PinnedDirsUpdatedMessage` to server→browser messages in `browser-protocol.ts`
- [x] 3.3 Handle pin/unpin/reorder messages in `browser-gateway.ts`, call state-store, broadcast `pinned_dirs_updated`
- [x] 3.4 Send `pinned_dirs_updated` on browser WebSocket connect (initial state)
- [x] 3.5 Add `GET /api/pinned-dirs` REST endpoint to `server.ts`

## 4. Client-side pinned directory state

- [x] 4.1 Add pinned directories state to `App.tsx` (or relevant state manager), handle `pinned_dirs_updated` WebSocket message
- [x] 4.2 Add WebSocket send helpers for `pin_directory`, `unpin_directory`, `reorder_pinned_dirs`

## 5. Sidebar grouping with pinned sections

- [x] 5.1 Update `groupSessionsByDirectory` in `SessionList.tsx` to accept pinned paths and split groups into pinned (in pinned order, including zero-session groups) and unpinned (sorted by recency)
- [x] 5.2 Write tests for updated grouping logic (pinned first, zero-session pinned groups, unpinned sorted by recency)
- [x] 5.3 Render pinned groups with 📌 icon and unpin button on group headers
- [x] 5.4 Render unpinned groups with pin button on group headers
- [x] 5.5 Add visual separator between pinned and unpinned sections
- [x] 5.6 Ensure pinned groups with zero sessions show "+ New" spawn button

## 6. Directory-level drag-and-drop

- [x] 6.1 Add a separate `DndContext` for pinned directory group reordering using `@dnd-kit`
- [x] 6.2 Create `SortablePinnedGroup` wrapper component (similar to `SortableSessionCard`)
- [x] 6.3 On drag end, send `reorder_pinned_dirs` WebSocket message with new order
- [x] 6.4 Verify session-level DnD within groups still works independently

## 7. Manual pin dialog

- [x] 7.1 Create `PinDirectoryDialog` component with path text input
- [x] 7.2 Add "Pin directory" button to sidebar header area that opens the dialog
- [x] 7.3 On confirm, send `pin_directory` WebSocket message

## 8. Cleanup and documentation

- [x] 8.1 Update `docs/architecture.md` with pinned directories persistence and protocol
- [x] 8.2 Update `AGENTS.md` key files table with new/removed files
- [x] 8.3 Delete `~/.pi/dashboard/workspaces.json` reference from documentation
