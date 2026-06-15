## 1. Add preference to the store

- [x] 1.1 Add `autoInitWorktreeOnSpawn?: boolean` to the preferences schema in `src/server/preferences-store.ts` (default/absent → `false`)
- [x] 1.2 Add getter/setter (or extend existing generic preference get/set) for the key
- [x] 1.3 If preferences are part of the shared contract, add the key to the type in `packages/shared/src/` (N/A — `preferences.json` keys are server-internal `PreferencesData`, not a shared type)
- [x] 1.4 Write tests: absent key reads `false`; set persists to `preferences.json`

## 2. Settings UI toggle

- [x] 2.1 Add an "Initialize on worktree" toggle to the relevant Settings section (general/worktree)
- [x] 2.2 Wire it to read/write `autoInitWorktreeOnSpawn` via the existing preference API
- [x] 2.3 Write test: toggling the control issues the preference update

## 3. Post-spawn auto-trigger (client)

- [x] 3.1 In the worktree-spawn success path, when `autoInitWorktreeOnSpawn` is ON, call `fetchWorktreeInitStatus(newCwd)`
- [x] 3.2 If `{ hasHook, needsInit, trusted } === { true, true, true }`, call `runWorktreeInit(newCwd)` (reuse existing progress bus + failure handling)
- [x] 3.3 If `needsInit` is false, do nothing
- [x] 3.4 If `trusted` is false, do NOT auto-run — leave the `WorktreeInitButton` to handle manual trust
- [x] 3.5 Write tests: trusted+needsInit → auto-run; untrusted → no auto-run; needsInit=false → no-op

## 4. Verify TOFU invariant

- [x] 4.1 Confirm `POST /api/git/worktree/init` still returns `init_untrusted` for untrusted hooks regardless of caller
- [x] 4.2 Add/confirm test that the auto-trigger path never sends a forged `confirmHash`

## 5. Docs + end-to-end

- [x] 5.1 Update `docs/file-index-server.md` (preferences-store row) and `docs/file-index-client.md` (spawn-path row) per Documentation Update Protocol (delegate to subagent, caveman style)
- [x] 5.2 Add a FAQ entry in `docs/faq.md`: "How do I auto-initialize worktrees on spawn?"
- [x] 5.3 Run full test suite (`npm test 2>&1 | tee /tmp/pi-test.log`), fix failures
- [x] 5.4 Manual check: enable toggle, spawn a worktree in a trusted repo → init runs automatically; spawn in an untrusted repo → Initialize button appears (requires live browser verification)
