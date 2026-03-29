## 1. Browse API Endpoint

- [x] 1.1 Add `GET /api/browse` endpoint in `server.ts`: accept `path` query param (default to `os.homedir()`), return directory entries with `isGit`/`isPi` flags, localhost-only, cap at 200 entries, hidden dirs excluded
- [x] 1.2 Add tests for browse endpoint (valid dir, default to home, non-existent dir, parent path, root has null parent, hidden dirs excluded, entry limit, remote blocked)

## 2. PathPicker Component

- [x] 2.1 Create `src/client/lib/browse-api.ts` with `browseDirectory(path?)` helper function
- [x] 2.2 Create `src/client/components/PathPicker.tsx`: text input (always focused) + fixed-height scrollable directory list, `initialPath`/`onSelect`/`onCancel`/`rows` props
- [x] 2.3 Implement keyboard model: ↓/↑ move highlight, Tab descends into highlighted dir, Enter confirms, Esc cancels, typing filters list and resets highlight
- [x] 2.4 Implement single-match auto-select (Tab completes lone match without arrow key)
- [x] 2.5 Implement backspace-past-slash (re-fetch parent, filter with remaining text)
- [x] 2.6 Implement click-to-descend and `..` parent navigation
- [x] 2.7 Add visual indicators for git repos and pi projects in directory entries
- [x] 2.8 Handle edge cases: empty directory, no filter matches, loading state, paste full path
- [x] 2.9 Add tests for PathPicker (keyboard navigation, filtering, descend/ascend, click, edge cases, loading state)

## 3. Integrate with PinDirectoryDialog

- [x] 3.1 Replace text input in `PinDirectoryDialog.tsx` with `<PathPicker>` component
- [x] 3.2 Update PinDirectoryDialog tests for PathPicker integration
