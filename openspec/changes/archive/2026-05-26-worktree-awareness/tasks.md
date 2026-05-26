## 1. Worktree Detection

- [ ] 1.1 Add `isWorktree?: boolean` to `GitInfo` interface in `src/extension/git-info.ts`
- [ ] 1.2 Implement worktree detection in `gatherGitInfo`: check if `<cwd>/.git` is a file via `fs.statSync`
- [ ] 1.3 Add `isWorktree?: boolean` to `DashboardSession` in `src/shared/types.ts`
- [ ] 1.4 Update `git-info.test.ts`: add test for worktree detection (`.git` file vs directory)

## 2. Protocol & Server

- [ ] 2.1 Forward `isWorktree` in session register and git_info_update messages through the bridge
- [ ] 2.2 Store and propagate `isWorktree` in session-manager and browser protocol messages

## 3. Session Card Display

- [ ] 3.1 Update `GitInfo` component in `SessionCard.tsx`: when `session.isWorktree` is true, show `🌲 <folder-name>` instead of `⎇ <branch>`
- [ ] 3.2 Update `SessionCard.test.tsx`: add tests for worktree display vs branch display

## 4. Zed Open Behavior

- [ ] 4.1 Add `openArgs?: string[]` field to `EditorEntry` in `editor-registry.ts`
- [ ] 4.2 Set `openArgs: ["-n"]` on the Zed editor entry
- [ ] 4.3 Update open-editor endpoint in `server.ts` to prepend `openArgs` before the target path
- [ ] 4.4 Update `editor-registry.test.ts` or add endpoint test for openArgs behavior
