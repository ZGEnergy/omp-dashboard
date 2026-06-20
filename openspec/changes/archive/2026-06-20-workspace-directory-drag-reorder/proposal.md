## Why

The sidebar lets users drag-reorder **sessions** (within a folder) and **pinned directory groups**, but **workspaces cannot be reordered** and **folders inside a workspace cannot be reordered** — even though the server already supports both.

The `folder-workspaces` change (archived 2026-05-15) shipped the full backend for both operations:

- `reorder_workspaces` and `reorder_workspace_folders` WebSocket message types (`packages/shared/src/browser-protocol.ts`)
- `handleReorderWorkspaces` / `handleReorderWorkspaceFolders` handlers + gateway routes (`packages/server/src/browser-handlers/directory-handler.ts`, `browser-gateway.ts`)
- `reorderWorkspaces` / `reorderWorkspaceFolders` store methods with passing unit tests (`packages/server/src/preferences-store.ts`, `__tests__/preferences-store.test.ts`)

But the **client never wired any of it**. `grep -rn "reorder_workspaces\|onReorderWorkspaces" packages/client/src` returns zero hits. The workspace tier renders as a plain `.map()` (`SessionList.tsx:1004`); workspace bodies render folders as a plain `ws.folders.map()` (`SessionList.tsx:1023`). Neither is wrapped in a `SortableContext`, and `WorkspaceHeader` has no drag handle. The `folder-workspaces` spec's "Workspace reordering" and "Folder ordering within a workspace" requirements describe a contract the UI does not yet honor.

Separately, the sidebar gives **weak drag feedback**: dragged items dim to `opacity: 0.5` in place and neighbors slide, but there is no explicit drop indicator. The board already solved this (archived `add-board-drag-visual-feedback`, 2026-06-14) with `DragOverlay` + `isOver` highlight + `cursor-grab`; the sidebar should reach parity.

## What Changes

Pure client-side work — **no server, protocol, or persistence changes**.

- **Workspaces become drag-reorderable.** Wrap the workspace tier in a `SortableContext`; add a drag handle to `WorkspaceHeader`; on drop, `arrayMove` the workspace ids and `send({ type: "reorder_workspaces", ids })`.
- **Folders inside a workspace become drag-reorderable.** Wrap each workspace body in its own per-workspace `SortableContext` (folders reorder only within their workspace); on drop, `send({ type: "reorder_workspace_folders", id, paths })`.
- **Dragged workspace auto-collapses during drag, restores on drop.** Only the dragged workspace collapses (others unchanged). The collapse is **client-local and visual only** — it MUST NOT emit `set_workspace_collapsed`, so the user's server-persisted collapsed preference is never clobbered. On drop or cancel, the prior expanded/collapsed state is restored.
- **Highlighted-slot drop indicator.** While dragging, the hovered target slot shows a dashed outline + faint accent background (driven by `@dnd-kit` `isOver`). Applies to **workspaces, workspace-folders, and pinned-groups** — NOT individual sessions (sessions keep today's slide-only feedback).
- **Type-aware collision detection.** The new `workspace` and `workspace-folder` draggables share the sidebar's single `DndContext`. With `closestCenter`, an expanded workspace's inner folders/sessions would capture a workspace-level drag (resolving `over` to the wrong `type`, causing a silent snap-back). This change replaces `collisionDetection={closestCenter}` with a type-aware `sameTypeClosestCenter` that filters candidate droppables to the active draggable's `type` before measuring distance.
- **Sessions are unchanged.** Sessions remain reorderable only within their folder (existing behavior); they are not draggable across folders and get no new indicator.

## Capabilities

### New Capabilities

- `sidebar-drag-reorder`: Client drag-to-reorder for workspaces and for folders within a workspace (realizing the server protocol the `folder-workspaces` capability already defines); workspace auto-collapse-during-drag (local-only); highlighted-slot drop indicator across workspace / workspace-folder / pinned-group drags. Requires type-aware collision detection so nested sortable contexts do not capture outer-type drags.

### Modified Capabilities

_(none — `folder-workspaces` server requirements are unchanged; this realizes them on the client. The pinned drop-indicator is specified here as new `sidebar-drag-reorder` behavior rather than a modification of the existing pinned requirement.)_

## Impact

- **Affected code (client only)**:
  - `packages/client/src/App.tsx` — add `onReorderWorkspaces={(ids) => send({ type: "reorder_workspaces", ids })}` and `onReorderWorkspaceFolders={(id, paths) => send({ type: "reorder_workspace_folders", id, paths })}` (mirrors existing `onReorderPinnedDirs`).
  - `packages/client/src/components/SessionList.tsx` — replace `collisionDetection={closestCenter}` with `sameTypeClosestCenter`; wrap workspace tier + each workspace body in `SortableContext`; add `case "workspace"` and `case "workspace-folder"` to `handleDragEnd` (folder case rejects cross-workspace drops via `active.data.wsId === over.data.wsId` guard); add drag-collapse local state in `onDragStart`/`onDragEnd`; pass new props.
  - `packages/client/src/components/SortableWorkspace.tsx` (new) — mirrors `SortablePinnedGroup`, hands drag-handle props to `WorkspaceHeader` via context, renders drop-indicator on `isOver`.
  - `packages/client/src/components/SortableWorkspaceFolder.tsx` (new) — same wrapper for intra-workspace folders, carries `wsId` in `useSortable` data.
  - `packages/client/src/components/WorkspaceHeader.tsx` — consume drag-handle context (like the folder header does via `useFolderDragHandle`).
  - Shared drop-indicator treatment applied in the three sortable wrappers (`SortableWorkspace`, `SortableWorkspaceFolder`, `SortablePinnedGroup`).
- **No server / API / protocol changes.** Backend already complete and tested.
- **No persistence migration.** `workspaces[]` order and `folders[]` order already persisted server-side.
- **Tests**: client drag-end unit tests (workspace reorder fires `reorder_workspaces`; folder reorder fires `reorder_workspace_folders`; cross-workspace folder drop is a no-op; drag-collapse never emits `set_workspace_collapsed`; indicator renders for workspace/folder/pinned but not session). Mirror `session-drag-reorder.test.tsx` style.
- **Docs**: update `docs/file-index-client.md` rows for `SessionList.tsx`, `WorkspaceHeader.tsx`, and the two new `Sortable*` components (delegated per Documentation Update Protocol).
