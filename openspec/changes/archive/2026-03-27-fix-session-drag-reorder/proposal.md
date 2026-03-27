## Why

Session card drag-and-drop reordering silently fails for sessions inside pinned directory groups. Cards visually move during the drag but snap back to their original position on drop. This is caused by nested `DndContext` components — the inner context (for pinned directory reordering) intercepts session drag events instead of the outer context (for session reordering).

## What Changes

- Flatten the two nested `DndContext` components in `SessionList.tsx` into a single `DndContext`
- Use dnd-kit's `data` property on sortable items to discriminate between session drags and pinned-group drags
- Route the single `onDragEnd` handler based on the dragged item's `data.type`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-ordering`: The client drag-and-drop interaction requirement is not met for sessions in pinned groups. The fix ensures drag-and-drop works regardless of whether the group is pinned or unpinned.

## Impact

- `src/client/components/SessionList.tsx` — merge nested DndContexts into one, update drag-end handler
- `src/client/components/SortableSessionCard.tsx` — add `data: { type: "session" }` to `useSortable`
- `src/client/components/SortablePinnedGroup.tsx` — add `data: { type: "pinned-group" }` to `useSortable`
- `src/client/components/__tests__/session-drag-reorder.test.tsx` — add test coverage for pinned group reorder
