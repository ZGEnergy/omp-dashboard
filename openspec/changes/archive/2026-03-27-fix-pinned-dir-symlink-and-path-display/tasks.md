## 1. Symlink resolution on server

- [x] 1.1 Add `realpathSync` helper that resolves a path and falls back to the original on error
- [x] 1.2 Apply resolution in `browser-gateway.ts` `pin_directory` handler before calling `stateStore.pinDirectory()`
- [x] 1.3 Apply resolution in `browser-gateway.ts` `reorder_pinned_dirs` handler before calling `stateStore.reorderPinnedDirs()`
- [x] 1.4 Write tests for symlink resolution (resolve success, resolve failure fallback)

## 2. Middle-truncation utility

- [x] 2.1 Create `truncatePathMiddle(path: string, maxLen: number): string` in `src/client/lib/truncate-path.ts`
- [x] 2.2 Write tests: path within limit returns unchanged, path exceeding limit truncates middle with `…`, two-segment path returns unchanged, edge cases (empty, root only)

## 3. Full path display in group headers

- [x] 3.1 Replace `group.cwd.split("/").pop()` with `truncatePathMiddle(group.cwd, maxLen)` in `SessionList.tsx` `renderGroup`
- [x] 3.2 Verify both pinned and unpinned groups show full paths

## 4. Editor detection for pinned directories

- [x] 4.1 Extend `cwds` list in `SessionList.tsx` to include `pinnedDirectories` cwds alongside session-derived cwds, deduplicated
- [x] 4.2 Verify empty pinned groups show editor buttons when editors are available

## 5. Distinct unpin icon

- [x] 5.1 Use a different icon for the unpin action on pinned groups (e.g., MDI `mdiPinOff`) to distinguish it from the pin action on unpinned groups

## 6. Update specs and docs

- [x] 6.1 Update `session-grouping` main spec to reflect full-path display
- [x] 6.2 Update AGENTS.md, README.md, and docs/architecture.md if needed
