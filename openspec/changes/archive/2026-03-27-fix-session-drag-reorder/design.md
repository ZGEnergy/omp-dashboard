## Context

The `SessionList` component uses two nested `DndContext` components from dnd-kit:
- **Outer**: handles session card reordering (`handleSessionDragEnd`)
- **Inner**: handles pinned directory group reordering (`handlePinnedDirDragEnd`)

The `useSortable` hook connects to the nearest parent `DndContext`. Session cards inside pinned groups connect to the inner context, which has the wrong `onDragEnd` handler — one that looks for directory paths, not session IDs.

## Goals / Non-Goals

**Goals:**
- Session card drag-and-drop works in both pinned and unpinned groups
- Pinned directory group drag-and-drop continues to work
- Minimal code change — fix the structural problem without refactoring unrelated code

**Non-Goals:**
- Cross-group drag (moving sessions between directories)
- Touch/mobile drag support improvements
- Drag-and-drop animation changes

## Decisions

### Single DndContext with data-typed sortables

**Decision**: Merge both `DndContext` components into one. Use dnd-kit's `data` property on `useSortable` to tag items as `{ type: "session" }` or `{ type: "pinned-group" }`.

**Rationale**: dnd-kit's `useSortable` always connects to the nearest parent `DndContext`. Nesting contexts creates an implicit routing problem. A single context with typed data is the idiomatic dnd-kit pattern for mixed sortable lists.

**Alternatives considered**:
- *Separate non-overlapping DndContexts*: Would require splitting the DOM so pinned group containers and session card containers don't nest. This fights the natural layout.
- *Prefixed IDs* (e.g., `pin::/path`, `sess::s1`): Works but fragile — ID parsing is error-prone and leaks into unrelated code.

### Dispatch in onDragEnd by data.type

**Decision**: The single `onDragEnd` handler checks `event.active.data.current?.type` to dispatch to the correct reorder logic.

```
onDragEnd(event):
  if active.data.type === "session"     → reorder sessions within group
  if active.data.type === "pinned-group" → reorder pinned directories
```

### Restrict drag targets by type

**Decision**: Use dnd-kit's `data` on droppable items so the collision detection only considers matching types. In the `onDragEnd` handler, verify `over.data.current?.type` matches `active.data.current?.type` before processing.

## Risks / Trade-offs

- **[Risk] Collision detection across types**: With one DndContext, a session card could collide with a pinned-group droppable during drag. → **Mitigation**: Check type match in `onDragEnd`; mismatches are no-ops.
- **[Risk] Regression in unpinned group reorder**: Currently works. → **Mitigation**: Existing test verifies drag handles render; add explicit reorder logic tests.
