## 1. Shared types + bridge detection

- [x] 1.1 Add `GitWorktreeInfo` interface to `packages/shared/src/types.ts` (`mainPath: string; name: string; base?: string`) and `gitWorktree?: GitWorktreeInfo` on `DashboardSession`
- [x] 1.2 Mirror the field on `GitInfo` in `packages/extension/src/vcs-info.ts` (`git-info.ts` was renamed in an earlier change)
- [x] 1.3 Implement `detectWorktree(cwd)` in `vcs-info.ts`: run `git rev-parse --git-common-dir` and `--show-toplevel` via new `commonDirOr` / `toplevelOr` recipes in `platform/git.ts`; return `{ mainPath, name }` when common-dir is outside top-level, else `undefined`
- [x] 1.4 Wire `detectWorktree` into `gatherGitInfo` and ensure failure of the rev-parse pair short-circuits to `undefined` (does NOT block branch / remote / PR detection)
- [x] 1.5 Unit tests for `detectWorktree`: main checkout (abs + rel commonDir), worktree, sibling-layout worktree, nested-cwd-not-worktree, rev-parse failure (mocked at platform layer)
- [x] 1.6 Forward `gitWorktree` on `git_info_update` payload (session_register itself does not carry git info; followup git_info_update covers both register and live update paths); add `lastGitWorktreeJson` change-detection cache to `BridgeContext` + sync wrappers

## 2. Server-side propagation + meta persistence

- [x] 2.1 Store `gitWorktree` on the in-memory `Session` model — already handled by `Object.assign` in `memory-session-manager.ts#update`; field added to `DashboardSession` in §1
- [x] 2.2 Forward `gitWorktree` on `session_added` / `session_updated` browser messages — already covered by generic `broadcastSessionUpdated(updates)` spread; `event-wiring.ts` now includes `gitUpdates.gitWorktree`
- [x] 2.3 Extend `.meta.json` writer to persist a new optional `gitWorktreeBase: string` field on `SessionMeta`
- [x] 2.4 Compose `gitWorktree.base` into browser payloads via new pure helper `composeWorktreePayload` in `packages/server/src/git-worktree-compose.ts`; wired into `event-wiring.ts#git_info_update`; `session-scanner.ts` loads `meta.gitWorktreeBase` onto `DashboardSession.gitWorktreeBase` (server-internal cache field)
- [x] 2.5 Backward-compat tests: 5 unit tests for `composeWorktreePayload` (undefined / null / wire-without-base / wire-with-base / cache-merge / immutability); 4 tests for `SessionMeta.gitWorktreeBase` round-trip incl. legacy-meta-file scenario

## 3. Pure helpers

- [x] 3.1 Create `packages/server/src/git-worktree.ts` with pure `slugifyBranch(branch: string): string` matching the design's slug rule
- [x] 3.2 Add pure `parsePorcelainWorktrees(stdout: string): WorktreeEntry[]` parser; first record flagged `isMain: true`
- [x] 3.3 Add pure `resolveDefaultBase({ currentBranch, localBranches, remoteBranches }): { ok: true, base } | { ok: false, error: "no_usable_base" }` implementing the fallback chain (current → develop → main → master, local-first then `origin/<x>`)
- [x] 3.4 Add pure `ensureWorktreeExcludeLine(existing: string): { content: string; appended: boolean }` for idempotent `.git/info/exclude` mutation
- [x] 3.5 33 unit tests pass: slug (8 cases incl. spec example + length cap + all-strippable), porcelain (8 cases incl. main-only, multi, detached, bare, locked-tolerated, CRLF, malformed), fallback (9 cases incl. local-over-remote precedence + detached + total-miss), exclude (7 cases incl. CRLF + boundary substrings)

## 4. Server endpoints

- [x] 4.1 Add `readHead(cwd)` to `packages/server/src/git-operations.ts`; returns `{ branch, detached, sha }` using `git symbolic-ref --quiet --short` + `rev-parse --short HEAD`
- [x] 4.2 Add `listWorktrees(cwd)` to `git-operations.ts`; runs `git worktree list --porcelain`; calls `parsePorcelainWorktrees`
- [x] 4.3 Add `addWorktree({ cwd, base, newBranch, path, force })` to `git-operations.ts`; resolves parent repo via `git-common-dir` (works from any worktree); pre-flight path-exists check; runs `git worktree add` with shell-escaped args; appends `.worktrees/` to `.git/info/exclude` (idempotent, only when path was auto-derived); maps stderr patterns onto stable error codes (`branch_in_use` / `branch_exists` / `base_not_found` / `path_exists` / `git_failed`)
- [x] 4.4 Register `GET /api/git/head` in `packages/server/src/routes/git-routes.ts` (localhost-only, `validateCwd` realpath check via `safeRealpathSync`, stable `code` field on errors)
- [x] 4.5 Register `GET /api/git/worktrees`
- [x] 4.6 Register `POST /api/git/worktree` returning `{ path, branch, excludeAppended }`; HTTP status 200 success / 400 input / 409 state-conflict (branch/path) / 500 unclassified. (§8 wires §-aware `gitWorktreeBase` meta-persistence into the spawn flow.)
- [x] 4.7 Integration tests: 13 unit-level ops tests (happy path + every error arm + cross-worktree parent-resolve) + 10 HTTP-level route tests (envelope shape + status codes + stable codes for each documented arm). Also extended `ApiResponse` with `stderr?: string` to support inline git-error rendering.

## 5. Client grouping + display

- [x] 5.1 Extend `resolveSessionGroupPath` in `packages/client/src/lib/session-grouping.ts` with the new step 3 (`gitWorktree.mainPath`); platform inference also samples worktree mainPaths
- [x] 5.2 Extend `clusterByWorkspaceName` to also key on `gitWorktree?.name`; empty-key cluster sorts first; remaining keys alphabetical
- [x] 5.3 7 new unit tests in `session-grouping-worktree.test.ts`: worktree session collapses under pinned/unpinned parent, explicit pin of worktree wins, jj+worktree both present → jj wins (both grouping AND clustering), cluster adjacency with server-provided ordering, plain-checkout backward-compat. Pre-existing 6 jj tests still pass (no regressions).
- [x] 5.4 Added `<WorktreePill session>` component in `SessionCard.tsx`; rendered inline at end of `GitInfo` (after branch + PR). Renders `<span data-testid="worktree-pill">worktree</span>` with the specified styling tokens; `title` attribute reflects `base` presence. Mobile branch already does not invoke `GitInfo`, so mobile is pill-free by construction.
- [x] 5.5 9 component tests in `WorktreePill.test.tsx`: standalone pill (3 cases: base / no-base / absent), styling-token assertions, GitInfo integration (branch unchanged + document-order check), plain-checkout absence, no-branch absence, desktop-card-renders, mobile-card-does-not-render.

## 6. Worktree dialog

- [ ] 6.1 Add client fetch helpers to `packages/client/src/lib/git-api.ts`: `getHead`, `listWorktrees`, `createWorktree`
- [ ] 6.2 Create `packages/client/src/components/WorktreeSpawnDialog.tsx` composing `BranchPicker` + path preview; layout: existing-worktrees list (top), divider, create form (bottom)
- [ ] 6.3 On mount, fetch `getHead` + `listWorktrees` in parallel; compute default base via the client-side equivalent of `resolveDefaultBase` (the helper is shared by the server, see 3.3; expose a client-safe path if needed)
- [ ] 6.4 Existing-worktrees list: each row clickable; on select, immediately call spawn action (no second confirmation) with the worktree's path as cwd; close dialog
- [ ] 6.5 Create form: base picker, new-branch input (required, live slug preview shown as path under the input), path field (editable, defaults to derived); submit → `createWorktree` → spawn on returned path → close
- [ ] 6.6 Render structured errors inline (path_exists / branch_in_use / no_usable_base map to actionable messages); other codes surface stderr verbatim in a collapsed area
- [ ] 6.7 Show footnote when the repo has submodules: "submodules will not be initialized in the new worktree"
- [ ] 6.8 Component tests: existing-worktree row spawn, create-mode happy path, slug preview reactivity, error-inline rendering, footnote conditional

## 7. Action-bar integration

- [ ] 7.1 Add `+Worktree` button to `FolderActionBar.tsx` in the second slot (between `+Session` and `Terminals`)
- [ ] 7.2 Hide the button when no session under the folder has a `gitBranch` and the folder is not on the editor-detection git allowlist (i.e. the folder is not a git repo)
- [ ] 7.3 Hide the button on non-loopback access (match existing remote-hide pattern for the action bar)
- [ ] 7.4 Wire the button's `onClick` to open `WorktreeSpawnDialog` with the folder's cwd
- [ ] 7.5 Component tests: button visible on git folder, hidden on non-git folder, hidden on remote

## 8. Auto-spawn wiring

- [ ] 8.1 After the dialog calls `createWorktree`, invoke the existing spawn action with `cwd = <new worktree path>` and propagate `base` through a new spawn-options field `gitWorktreeBase` so the server can persist it to `.meta.json` on session creation
- [ ] 8.2 Server: on `spawn` actions carrying `gitWorktreeBase`, write that field to the session's `.meta.json` before bridge attaches
- [ ] 8.3 End-to-end test (server + client): dialog create → spawn → resulting session has `gitWorktree.base` populated in its `session_added` payload

## 9. Supersede prior changes

- [ ] 9.1 Add a top-of-file note in `openspec/changes/worktree-awareness/proposal.md`: "**Superseded by `add-worktree-spawn-dialog`**" with a one-line summary of why (different card-display decision, no grouping fix)
- [ ] 9.2 Same note in `openspec/changes/workspace-actions/proposal.md`: "**Superseded by `add-worktree-spawn-dialog`**" (different layout, narrower scope)
- [ ] 9.3 Move both superseded change directories to `openspec/changes/archive/superseded/` (preserve their artifacts; they were never implemented so no spec merge is needed)
- [ ] 9.4 Confirm `openspec list` no longer shows `worktree-awareness` or `workspace-actions` in the active list

## 10. Documentation

- [ ] 10.1 Add a row to `docs/file-index-server.md` for the new `git-worktree.ts` helper (caveman style, path-alphabetical)
- [ ] 10.2 Add a row to `docs/file-index-client.md` for `WorktreeSpawnDialog.tsx` (caveman style)
- [ ] 10.3 Update existing rows for `git-operations.ts` / `git-routes.ts` to mention the new endpoints (one-line append; do not pad)
- [ ] 10.4 Update existing rows for `git-info.ts` / `session-grouping.ts` to mention worktree fields and precedence step 3
- [ ] 10.5 Mention the new `.worktrees/` layout convention in `docs/architecture.md` (one short paragraph under git workflow / repo conventions)

## 11. Validation

- [ ] 11.1 Run `openspec validate --change add-worktree-spawn-dialog --strict`
- [ ] 11.2 Run full test suite (`npm test`); ensure all new tests pass and no existing tests regress
- [ ] 11.3 Manual smoke test on a real repo: open dialog, see main + any existing worktrees listed; create a new worktree from `develop`; confirm session card renders worktree pill; confirm session groups under parent pinned dir
- [ ] 11.4 Cross-platform check: same smoke test on Windows (path separators in derived paths, exclude file)
