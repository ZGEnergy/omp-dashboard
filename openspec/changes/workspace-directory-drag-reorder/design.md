# Design

## Context

The sidebar (`SessionList.tsx`) hosts a single `DndContext` (`:989`) with two existing draggable types:

- `session` — reorders within a folder group (`handleDragEnd` `:474`)
- `pinned-group` — reorders top-level pinned folders (`:519`)

Both use `@dnd-kit/sortable`. Drag feedback today = `opacity: 0.5` on the dragged node (`SortablePinnedGroup.tsx`) + dnd-kit's slide animation. There is **no explicit drop indicator** anywhere in the sidebar.

The workspace tier (`:1004`) and intra-workspace folders (`:1023`) are plain `.map()`s — not sortable. The server already accepts `reorder_workspaces` and `reorder_workspace_folders` and persists both orders.

## Decisions

### 1. Drag-collapse is client-local and visual only

`workspace.collapsed` is **server-persisted** (`set_workspace_collapsed` → `workspaces_updated`). The drag-collapse must never touch that state, or dragging would silently rewrite the user's saved preference.

Model collapse display as the OR of two sources:

```
display(W).collapsed = forceCollapsed.has(W.id) ? true : W.collapsed   // W.collapsed = server value
```

- `onDragStart(workspace)`: `forceCollapsed.add(active.id)`. Only the dragged workspace. No snapshot of others needed — neighbors render from their unchanged server value.
- `onDragEnd` / `onDragCancel`: `forceCollapsed.clear()`. Restore is automatic because display falls back to the server value.
- **Never** call `onSetWorkspaceCollapsed` / send `set_workspace_collapsed` from this path.

Only `type === "workspace"` collapses (workspaces are the only collapsible draggable). Folders, pinned groups, and sessions have no collapsed concept, so drag-collapse is workspace-only by nature.

### 2. Nested sortable scope guard

Each workspace body becomes its own `SortableContext` keyed by that workspace's folder cwds. A `workspace-folder` `useSortable` carries `data: { type: "workspace-folder", wsId }`.

`handleDragEnd` extends the existing cross-type guard:

```ts
if (activeType !== overType) return;                 // existing
if (activeType === "workspace-folder" &&
    active.data.current?.wsId !== over.data.current?.wsId) return;  // new: no cross-workspace drop
```

A folder can only reorder within its own workspace. Cross-workspace moves are a no-op (assigning a folder to a different workspace stays the job of the existing AddToWorkspace menu, not drag).

### 3. Type-aware collision detection

With one `DndContext` and `closestCenter`, dnd-kit measures **every** droppable in the tree. When a workspace is expanded, its inner folders/sessions sit physically closer to the cursor than the workspace container, so `closestCenter` resolves `over` to an inner id of the wrong `type` and the cross-type guard silently bails (visible snap-back, no reorder).

The new workspace/folder types require a type-aware collision function:

```ts
const sameTypeClosestCenter: CollisionDetection = (args) => {
  const t = args.active.data.current?.type;
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.data.current?.type === t,
    ),
  });
};
```

This change owns the helper: replace `collisionDetection={closestCenter}` on the sidebar `DndContext` with `sameTypeClosestCenter`. The existing cross-type guard in `handleDragEnd` stays as defense-in-depth.

### 4. Drop indicator — highlighted slot (flavor B), centralized

Chosen over an insertion gap-line: a highlighted slot reads clearly with the compact rows produced by drag-collapse, and matches the `isOver` pattern the board already uses (`add-board-drag-visual-feedback`).

Centralize the treatment in the sortable wrappers so all three target types share one visual instead of three copies. Each wrapper exposes `isOver` from `useSortable` and applies, when `isOver && active.id !== id`:

```
outline: 1px dashed var(--accent);
background: color-mix(in srgb, var(--accent) 8%, transparent);
```

Applied in `SortableWorkspace`, `SortableWorkspaceFolder`, and (retrofit) `SortablePinnedGroup`. **Not** applied to session sortables — sessions keep slide-only feedback per product decision.

### 5. Drag handle delivery via context (existing idiom)

`SortablePinnedGroup` already passes `{...attributes, ...listeners}` to its folder header through `FolderDragHandleCtx` + `useFolderDragHandle()`. Reuse the pattern:

- `SortableWorkspace` → new `WorkspaceDragHandleCtx` consumed by `WorkspaceHeader`.
- `SortableWorkspaceFolder` → reuse `useFolderDragHandle` (the folder card inside already reads it).

No `cloneElement`, no child traversal.

## Drag lifecycle

```
onDragStart ──▶ if type==="workspace": forceCollapsed.add(active.id)   [decision 1]
onDragOver  ──▶ dnd-kit isOver drives slot highlight                   [decision 4]
onDragEnd   ──▶ guards (decisions 2,3) → arrayMove → send reorder_*    [proposal]
            └▶ forceCollapsed.clear()                                  [decision 1]
onDragCancel ─▶ forceCollapsed.clear()                                 [decision 1]
```

## Risks

| Risk | Mitigation |
|---|---|
| Drag-collapse persists by accident | Never call `onSetWorkspaceCollapsed` in drag path; unit test asserts no `set_workspace_collapsed` emitted |
| Collision still resolves to inner type | `sameTypeClosestCenter` (decision 3); regression test with expanded workspace |
| Cross-workspace folder drop corrupts order | `wsId` guard (decision 2); no-op test |

## Out of scope

- Cross-workspace folder moves via drag (use AddToWorkspace menu).
- Drop indicator on individual session cards.
- `DragOverlay` moving-chip preview for the sidebar (slot highlight is sufficient; revisit if needed).
