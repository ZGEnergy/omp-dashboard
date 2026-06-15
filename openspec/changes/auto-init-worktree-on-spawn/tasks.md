## 1. Add preference to the store

- [ ] 1.1 Add `autoInitWorktreeOnSpawn?: boolean` to the preferences schema in `src/server/preferences-store.ts` (default/absent → `false`)
- [ ] 1.2 Add getter/setter (or extend existing generic preference get/set) for the key
- [ ] 1.3 If preferences are part of the shared contract, add the key to the type in `packages/shared/src/`
- [ ] 1.4 Write tests: absent key reads `false`; set persists to `preferences.json`

## 2. Settings UI toggle

- [ ] 2.1 Add an "Initialize on worktree" toggle to the relevant Settings section (general/worktree)
- [ ] 2.2 Wire it to read/write `autoInitWorktreeOnSpawn` via the existing preference API
- [ ] 2.3 Write test: toggling the control issues the preference update

## 3. Post-spawn auto-trigger (client)

- [ ] 3.1 In the worktree-spawn success path, when `autoInitWorktreeOnSpawn` is ON, call `fetchWorktreeInitStatus(newCwd)`
- [ ] 3.2 If `{ hasHook, needsInit, trusted } === { true, true, true }`, call `runWorktreeInit(newCwd)` (reuse existing progress bus + failure handling)
- [ ] 3.3 If `needsInit` is false, do nothing
- [ ] 3.4 If `trusted` is false, do NOT auto-run — leave the `WorktreeInitButton` to handle manual trust
- [ ] 3.5 Write tests: trusted+needsInit → auto-run; untrusted → no auto-run; needsInit=false → no-op

## 4. Verify TOFU invariant

- [ ] 4.1 Confirm `POST /api/git/worktree/init` still returns `init_untrusted` for untrusted hooks regardless of caller
- [ ] 4.2 Add/confirm test that the auto-trigger path never sends a forged `confirmHash`

## 5. Docs + end-to-end

- [ ] 5.1 Update `docs/file-index-server.md` (preferences-store row) and `docs/file-index-client.md` (spawn-path row) per Documentation Update Protocol (delegate to subagent, caveman style)
- [ ] 5.2 Add a FAQ entry in `docs/faq.md`: "How do I auto-initialize worktrees on spawn?"
- [ ] 5.3 Run full test suite (`npm test 2>&1 | tee /tmp/pi-test.log`), fix failures
- [ ] 5.4 Manual check: enable toggle, spawn a worktree in a trusted repo → init runs automatically; spawn in an untrusted repo → Initialize button appears
