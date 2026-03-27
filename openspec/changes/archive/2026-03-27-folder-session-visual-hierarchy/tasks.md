## 1. Folder Group Container

- [x] 1.1 In `SessionList.tsx` `renderGroup`, replace the `<React.Fragment>` wrapper with a `<div>` that has `bg-[var(--bg-secondary)] rounded-lg p-2` (or similar padding)
- [x] 1.2 Remove `border-b border-[var(--border-primary)]` from the folder header `<li>` class
- [x] 1.3 Add `space-y-2` (or `gap-2 flex flex-col`) to the parent `<ul>` that holds all folder groups, plus `p-2` padding on the list

## 2. Session Card Background

- [x] 2.1 In `SessionCard.tsx`, add `bg-[var(--bg-tertiary)]` to the session card `<li>` className
- [x] 2.2 Update the selected card styling to use `bg-[var(--bg-tertiary)]` instead of `bg-[var(--bg-tertiary)]` (verify the selected state still uses left accent + background correctly)

## 3. Verify & Polish

- [x] 3.1 Verify pinned folder groups (inside `SortablePinnedGroup`) render correctly with the new container styling — drag handles still work
- [x] 3.2 Verify the separator between pinned and unpinned groups still looks correct with the new spacing
- [x] 3.3 Verify collapsed folder groups look correct (container visible, sessions hidden)
- [x] 3.4 Test both dark and light themes to confirm the 3-tier layering works in both
