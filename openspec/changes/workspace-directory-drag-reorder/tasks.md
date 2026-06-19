# Tasks

## 1. Collision detection
- [ ] 1.1 Add `sameTypeClosestCenter` collision-detection helper and replace `collisionDetection={closestCenter}` on the sidebar `DndContext`. → verify: filters `droppableContainers` by `active.data.current.type`

## 2. Workspace reorder (client)
- [ ] 2.1 Add `onReorderWorkspaces?: (ids: string[]) => void` prop to `SessionList` and wire `App.tsx` to `send({ type: "reorder_workspaces", ids })`. → verify: type-checks
- [ ] 2.2 Create `SortableWorkspace.tsx` (mirror `SortablePinnedGroup`) with `useSortable({ id, data: { type: "workspace" } })`, drag-handle context for `WorkspaceHeader`, and `isOver` drop indicator. → verify: renders, exposes handle
- [ ] 2.3 Wrap the workspace tier in `SortableContext` (items = workspace ids) and render each via `SortableWorkspace`. → verify: workspaces draggable
- [ ] 2.4 Add `case "workspace"` to `handleDragEnd`: `arrayMove` ids → `onReorderWorkspaces`. → verify: unit test fires `reorder_workspaces` with swapped ids
- [ ] 2.5 Add drag handle consumption to `WorkspaceHeader.tsx`. → verify: handle initiates drag

## 3. Intra-workspace folder reorder (client)
- [ ] 3.1 Add `onReorderWorkspaceFolders?: (id: string, paths: string[]) => void` prop and wire `App.tsx` to `send({ type: "reorder_workspace_folders", id, paths })`. → verify: type-checks
- [ ] 3.2 Create `SortableWorkspaceFolder.tsx` with `useSortable({ id, data: { type: "workspace-folder", wsId } })`, reusing `useFolderDragHandle`, with `isOver` drop indicator. → verify: renders
- [ ] 3.3 Wrap each workspace body in a per-workspace `SortableContext` (items = folder cwds) and render folders via `SortableWorkspaceFolder`. → verify: folders draggable within a workspace
- [ ] 3.4 Add `case "workspace-folder"` to `handleDragEnd` with `wsId` cross-workspace guard → `arrayMove` paths → `onReorderWorkspaceFolders`. → verify: same-workspace reorder fires message; cross-workspace drop is no-op

## 4. Drag-collapse (workspace, local-only)
- [ ] 4.1 Add `forceCollapsed` local state; set on `onDragStart` for `type === "workspace"`, clear on `onDragEnd`/`onDragCancel`. → verify: dragged workspace renders collapsed
- [ ] 4.2 Compute display collapsed = `forceCollapsed.has(id) || serverCollapsed`. → verify: only dragged workspace collapses; others unchanged
- [ ] 4.3 Ensure no `set_workspace_collapsed` is sent from the drag path. → verify: unit test asserts no emit

## 5. Drop indicator
- [ ] 5.1 Implement shared dashed-slot `isOver` treatment in `SortableWorkspace`, `SortableWorkspaceFolder`, and (retrofit) `SortablePinnedGroup`. → verify: indicator renders on hover for all three
- [ ] 5.2 Confirm session sortables get NO indicator. → verify: session targets unchanged

## 6. Tests
- [ ] 6.1 Workspace drag-end fires `reorder_workspaces` with correct order. → verify: green
- [ ] 6.2 Folder drag-end fires `reorder_workspace_folders`; cross-workspace drop is no-op. → verify: green
- [ ] 6.3 Drag-collapse renders collapsed and never emits `set_workspace_collapsed`. → verify: green
- [ ] 6.4 Indicator present for workspace/folder/pinned, absent for session. → verify: green
- [ ] 6.5 `npm test 2>&1 | tee /tmp/pi-test.log` — full suite green. → verify: no FAIL

## 7. Docs
- [ ] 7.1 Delegate to subagent (caveman style): update `docs/file-index-client.md` rows for `SessionList.tsx`, `WorkspaceHeader.tsx`, `SortableWorkspace.tsx`, `SortableWorkspaceFolder.tsx`. → verify: rows present, alphabetical

## 8. Validate
- [ ] 8.1 `openspec validate workspace-directory-drag-reorder --strict`. → verify: passes
