# Tasks

## 1. FolderSpawnButtons component
- [x] 1.1 Create `packages/client/src/components/FolderSpawnButtons.tsx` rendering a vertical stack: full-width `+ New Session` (green, `data-testid="folder-spawn-session-btn"`) and conditional full-width `+ New Worktree` (orange, `data-testid="folder-spawn-worktree-btn"`).
- [x] 1.2 Props: `spawningDisabled`, `showWorktree` (caller computes `isGitRepo && gitWorktreeEnabled && !!onSpawnWorktree`), `onSpawnSession`, `onSpawnWorktree?`. Each handler stops propagation.
- [x] 1.3 `+ New Session` disabled (opacity/cursor) when `spawningDisabled`; reuse existing green/orange Tailwind token classes from the old pills.

## 2. Trim FolderActionBar
- [x] 2.1 Remove the `+Session` and `+Worktree` `<button>` blocks from `FolderActionBar.tsx`.
- [x] 2.2 Remove now-unused props: `onSpawnSession`, `spawningDisabled`, `isGitRepo`, `gitWorktreeEnabled`, `onOpenWorktreeDialog`, and the `showWorktreeButton` derivation + `mdiPlus`/`mdiSourceBranchPlus` imports.
- [x] 2.3 Action bar now renders `Terminals(N) | Editor | [native editors] | Clean up broken | 🧩` only.

## 3. Wire stacked buttons in SessionList
- [x] 3.1 Render `<FolderSpawnButtons>` in the folder header content column, between `<FolderActionBar>` and `<SidebarFolderSectionSlot>`.
- [x] 3.2 Add `handleExpand(cwd)` (force-expand, not toggle) or guard existing toggle with `if (isCollapsed)`.
- [x] 3.3 `onSpawnSession` → if collapsed, expand first, then `onSpawnSession?.(group.cwd)`.
- [x] 3.4 `onSpawnWorktree` → if collapsed, expand first, then `setWorktreeDialogCwd(group.cwd)`. Pass `showWorktree` computed from `isGitRepo && gitWorktreeEnabled && !!onSpawnSession`.
- [x] 3.5 Drop the now-removed props from the `<FolderActionBar>` call site.

## 4. Tests
- [x] 4.1 `FolderSpawnButtons` test: session button always renders; worktree button gated by `showWorktree`; disabled state; click handlers fire.
- [x] 4.2 `SessionList` test: clicking spawn while collapsed expands the folder then spawns (assert expand state + spawn callback order).
- [x] 4.3 `SessionList` test: buttons render for a folder with 0 sessions.
- [x] 4.4 Update existing `FolderActionBar` tests — assert `+Session`/`+Worktree` no longer present in the bar.

## 5. Verify
- [x] 5.1 `npm test 2>&1 | tee /tmp/pi-test.log` green; `grep -nE 'FAIL|Error' /tmp/pi-test.log` clean.
- [x] 5.2 `npm run build` succeeds; manual check: collapsed folder → click `+ New Session` expands + spawns; non-git folder hides worktree button; 0-session pinned folder shows buttons.
- [x] 5.3 Update `docs/file-index-client.md` rows for `FolderActionBar.tsx`, `SessionList.tsx`, and new `FolderSpawnButtons.tsx` (delegate to subagent, caveman style).
