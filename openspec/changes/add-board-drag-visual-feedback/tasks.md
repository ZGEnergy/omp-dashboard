# Tasks

## 1. Grab cursor on cards

- [ ] 1.1 In `OpenSpecBoardView.tsx` `ProposalCard` root `<div>`, add
      `cursor-grab active:cursor-grabbing` to the className (alongside the
      existing `board-card` + `opacity-40` drag classes).
- [ ] 1.2 Verify column headers retain their existing `cursor: grab` (no
      regression).

## 2. Drag overlay (pointer-following preview)

- [ ] 2.1 Import `DragOverlay` from `@dnd-kit/core`.
- [ ] 2.2 Render `<DragOverlay>` inside `<DndContext>`, driven by `activeDrag`.
- [ ] 2.3 Add a lightweight `DragChip` component: shows the change/group name +
      state pill (for cards) or group name + dot (for columns). Do NOT re-render
      the full `ProposalCard` (no stepper/session subtree) in the overlay.
- [ ] 2.4 Confirm the source element keeps its `opacity-40`/`opacity-50` dim so
      the origin slot stays legible while the chip moves.

## 3. Drop-zone highlight

- [ ] 3.1 In `BoardColumn`, destructure `isOver` from `useDroppable(...)`
      (currently discarded).
- [ ] 3.2 Apply a highlight class to the column body when `isOver` is true —
      use existing accent/border tokens (e.g. ring or border-accent + subtle
      bg tint). Add a CSS class in `index.css` only if Tailwind utilities are
      insufficient.

## 4. Verify

- [ ] 4.1 Hover a card → grab (open-hand) cursor; press → grabbing cursor.
- [ ] 4.2 Drag a card → a chip follows the pointer; origin slot dims.
- [ ] 4.3 Drag a card over another column → that column highlights; drop →
      reassigns + persists (existing behavior intact).
- [ ] 4.4 Drag a column header → header shows grabbing cursor, preview follows,
      drop target highlights; reorder persists.
- [ ] 4.5 Existing tests in `OpenSpecBoardView.test.tsx` still pass; add a
      test asserting `DragOverlay` renders and `isOver` highlight class applies
      on drag-over if feasible with the test harness.
- [ ] 4.6 `npm test` green; no console errors during drag.
