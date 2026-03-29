## 1. Browse API Endpoint

- [ ] 1.1 Add `GET /api/browse` endpoint in `server.ts`: accept `path` query param (default to `os.homedir()`), return directory entries with `isGit`/`isPi` flags, localhost-only, cap at 200 entries, hidden dirs excluded
- [ ] 1.2 Add tests for browse endpoint (valid dir, default to home, non-existent dir, parent path, root has null parent, hidden dirs excluded, entry limit, remote blocked)

## 2. PathPicker Component

- [ ] 2.1 Create `src/client/lib/browse-api.ts` with `browseDirectory(path?)` helper function
- [ ] 2.2 Create `src/client/components/PathPicker.tsx`: text input (always focused) + fixed-height scrollable directory list, `initialPath`/`onSelect`/`onCancel`/`rows` props
- [ ] 2.3 Implement keyboard model: ↓/↑ move highlight, Tab descends into highlighted dir, Enter confirms, Esc cancels, typing filters list and resets highlight
- [ ] 2.4 Implement single-match auto-select (Tab completes lone match without arrow key)
- [ ] 2.5 Implement backspace-past-slash (re-fetch parent, filter with remaining text)
- [ ] 2.6 Implement click-to-descend and `..` parent navigation
- [ ] 2.7 Add visual indicators for git repos and pi projects in directory entries
- [ ] 2.8 Handle edge cases: empty directory, no filter matches, loading state, paste full path
- [ ] 2.9 Add tests for PathPicker (keyboard navigation, filtering, descend/ascend, click, edge cases, loading state)

## 3. Integrate with PinDirectoryDialog

- [ ] 3.1 Replace text input in `PinDirectoryDialog.tsx` with `<PathPicker>` component
- [ ] 3.2 Update PinDirectoryDialog tests for PathPicker integration
