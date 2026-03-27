## 1. Add data type to sortable components

- [x] 1.1 Add `data: { type: "session" }` to `useSortable` in `SortableSessionCard.tsx`
- [x] 1.2 Add `data: { type: "pinned-group" }` to `useSortable` in `SortablePinnedGroup.tsx`

## 2. Merge DndContexts in SessionList

- [x] 2.1 Remove the inner `DndContext` wrapping pinned groups in `SessionList.tsx`
- [x] 2.2 Create a unified `handleDragEnd` that dispatches by `active.data.current?.type` — call session reorder logic for `"session"` and pinned-dir reorder logic for `"pinned-group"`
- [x] 2.3 Verify `over.data.current?.type` matches `active.data.current?.type` before processing (cross-type no-op)

## 3. Tests

- [x] 3.1 Add test: session drag in pinned group calls `onReorderSessions` with correct order
- [x] 3.2 Add test: cross-type drag (session over pinned-group) is a no-op
- [x] 3.3 Verify existing tests pass (drag handles render, unpinned group reorder)
