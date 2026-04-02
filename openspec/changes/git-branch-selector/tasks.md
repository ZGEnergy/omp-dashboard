## 1. Shared Types

- [x] 1.1 Add git API types to `src/shared/rest-api.ts`: `GitBranchEntry`, `GitBranchesResponse`, `GitCheckoutRequest`, `GitCheckoutResponse` (with dirty/stashed variants), `GitInitRequest`, `GitStashPopResponse`

## 2. Server Git Operations

- [x] 2.1 Create `src/server/git-operations.ts` with functions: `listBranches(cwd)`, `checkoutBranch(cwd, branch, stash)`, `gitInit(cwd)`, `stashPop(cwd)`, `isGitRepo(cwd)`, `isDirty(cwd)`
- [x] 2.2 Write tests for `git-operations.ts` covering: branch listing with local/remote, clean checkout, dirty detection with 409 pattern, stash+checkout, remote branch tracking creation, git init, stash pop (clean and with conflicts)
- [x] 2.3 Register API endpoints in `src/server/server.ts`: `GET /api/git/branches`, `POST /api/git/checkout`, `POST /api/git/init`, `POST /api/git/stash-pop` (all localhost-guarded)

## 3. Extension: Detached HEAD

- [x] 3.1 Update `src/extension/git-info.ts` `detectBranch()` to detect detached HEAD and return the short commit SHA instead of `"HEAD"`
- [x] 3.2 Write/update tests for detached HEAD detection

## 4. Client: Git API Helpers

- [x] 4.1 Create `src/client/lib/git-api.ts` with fetch helpers: `fetchBranches(cwd)`, `checkoutBranch(cwd, branch, stash)`, `gitInit(cwd)`, `stashPop(cwd)`

## 5. Client: BranchPicker Component

- [x] 5.1 Create `src/client/components/BranchPicker.tsx`: typeahead input, filtered branch list with local/remote sections, keyboard navigation (↑↓/Enter/Escape), current branch `●` marker
- [x] 5.2 Write tests for BranchPicker: filtering, keyboard navigation, current branch not selectable, remote branch section

## 6. Client: BranchSwitchDialog

- [x] 6.1 Create `src/client/components/BranchSwitchDialog.tsx`: wraps BranchPicker, handles checkout call, dirty-state stash confirmation with file list, stash pop prompt after successful stash+checkout
- [x] 6.2 Write tests for BranchSwitchDialog: clean checkout flow, dirty→stash→pop flow, dirty→stash→decline-pop flow, cancel flow

## 7. Client: GroupGitInfo Integration

- [x] 7.1 Modify `GroupGitInfo` in `src/client/components/SessionCard.tsx` to accept an `onClick` handler and render the branch icon as a clickable button
- [x] 7.2 Add git-not-initialized state: dimmed branch icon that triggers init confirmation on click
- [x] 7.3 Wire up in `src/client/components/SessionList.tsx`: pass `cwd` and handler to `GroupGitInfo`, open `BranchSwitchDialog` on click, handle git init flow
- [x] 7.4 Write tests for clickable GroupGitInfo states: normal branch, detached HEAD, no git repo
