## 1. Server Endpoints

- [x] 1.1 ~~Add spawn-session endpoint~~ — Already implemented via WebSocket `spawn_session` in `browser-gateway.ts` (headless-spawn archive)
- [ ] 1.2 Add `POST /api/git/worktree` endpoint in `server.ts`: accept `{ cwd, branchName, worktreePath? }`, detect base branch, run `git worktree add -b`, auto-derive path if omitted, localhost-only
- [x] 1.3 ~~Add tests for spawn-session~~ — Already covered
- [ ] 1.4 Add tests for git/worktree endpoint (success, branch exists error, not a git repo, missing params)

## 2. Client API Helpers

- [ ] 2.1 Create `src/client/lib/workspace-api.ts` with `createWorktree(cwd, branchName, worktreePath?)` function
- [ ] 2.2 Add tests for workspace-api helpers

## 3. Add Worktree Dialog

- [ ] 3.1 Create `src/client/components/AddWorktreeDialog.tsx` with base branch display, branch name input, auto-derived path preview, create/cancel buttons
- [ ] 3.2 Add tests for AddWorktreeDialog (renders fields, auto-derives path, shows error)

## 4. Group Header Action Buttons

- [x] 4.1 ~~Add "Add pi-agent" button~~ — Already exists as `spawn-session-btn` in `SessionList.tsx`
- [ ] 4.2 Add "Add worktree" icon button to group header in `SessionList.tsx` (localhost-only, opens AddWorktreeDialog, hidden when no git branch)
- [ ] 4.3 Wire worktree button click to API call with toast feedback
- [ ] 4.4 Add tests for worktree button rendering (localhost vs remote, with/without git branch)
