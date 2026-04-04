## 1. Fix image data truncation

- [x] 1.1 Add test for `truncateStrings` preserving image `data` when sibling `mimeType` exists
- [x] 1.2 Add test for `truncateStrings` still truncating `data` without `mimeType` sibling
- [x] 1.3 Update `truncateStrings` in `src/server/memory-event-store.ts` to skip `data` fields with `mimeType` sibling
- [x] 1.4 Verify existing event store tests still pass

## 2. Sidebar default width

- [x] 2.1 Add test that `DEFAULT_WIDTH` equals `MAX_WIDTH` in `src/client/hooks/useSidebarState.ts`
- [x] 2.2 Change `DEFAULT_WIDTH` from 256 to 500

## 3. Folder pin icon consolidation

- [x] 3.1 Replace left-side pin icon / 📁 emoji with `mdiFolder` / `mdiFolderOpen` based on collapse state in `renderGroup()` of `src/client/components/SessionList.tsx`
- [x] 3.2 Replace right-side separate pin/unpin buttons with single `mdiPin` toggle (yellow when pinned, muted when unpinned)
- [x] 3.3 Remove `mdiPinOff` import if no longer used

## 4. Selected session card indicator

- [x] 4.1 Replace `border-l-2 border-l-blue-500/40` with `border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/30` for selected state in desktop `SessionCard`
- [x] 4.2 Add same blue highlight to mobile `SessionCard` variant (currently has no selected indicator)

## 5. Sidebar collapse icon relocation

- [x] 5.1 Remove collapse `←` button from `SessionList` header (the `onCollapseSidebar` button block)
- [x] 5.2 Add always-visible collapse chevron to `ResizableSidebar` drag handle, vertically centered
- [x] 5.3 Vertically center the expand button in collapsed strip (replace `mt-3` with flex centering)
- [x] 5.4 Verify drag-to-resize still works alongside the collapse button (stopPropagation on button)
- [x] 5.5 Remove double-click-to-collapse on drag handle (caused accidental toggles)

## 6. Mermaid diagram font fix

- [x] 6.1 Set system sans-serif font family in mermaid initialize config and themeVariables
- [x] 6.2 Add CSS override to undo monospace inheritance from `.markdown-content pre` for `.mermaid-diagram` elements
- [x] 6.3 Clear SVG cache on mermaid re-init to pick up font changes
