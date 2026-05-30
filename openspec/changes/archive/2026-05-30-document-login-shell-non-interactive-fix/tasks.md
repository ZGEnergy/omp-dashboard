# Tasks

## 1. Code invariant comment

- [x] 1.1 In `packages/shared/src/platform/binary-lookup.ts`, replace the one-line `/** Resolve a command via login shell … */` JSDoc above `whichViaLoginShell()` with a multi-line block documenting:
  - The `-l` (login) flag is required so the shell sources `~/.zprofile`, exposing nvm/volta/homebrew PATH entries when pi is launched from a GUI (Electron, Finder, Dock) where the parent process did not run the user's login profile.
  - The `-i` (interactive) flag MUST NOT be added. An interactive shell invokes `tcsetpgrp(stdin_fd, shell_pgid)` on startup to claim the terminal's foreground process group. When the shell exits, the parent pi process is no longer the foreground group; the tty driver delivers `SIGTSTP` and pi appears stopped (e.g. `[1]+ Stopped pi` in iTerm2 / macOS Terminal).
  - Cross-reference: `See change: document-login-shell-non-interactive-fix` (added after archive).
  - Mention that `bash` and `fish` exhibit the same `tcsetpgrp` behaviour, so the no-`-i` rule generalizes across shells.

## 2. Strengthen test

- [x] 2.1 In `packages/shared/src/__tests__/binary-lookup.test.ts`, find the test `"tries login shell when enabled and PATH fails"`.
- [x] 2.2 Add an explicit negative assertion: capture the actual `cmd` arg passed to the mocked `execSync`, then `expect(capturedCmd).not.toMatch(/-i\b|-il|-ilc/)`. The current `cmd.includes("-lc")` check passes for both `-lc` and `-ilc`, leaving the regression door open.
- [x] 2.3 Run `HOME=$(mktemp -d) npx vitest run packages/shared/src/__tests__/binary-lookup.test.ts` — confirm all 17 tests still pass.

## 3. Update docs/faq.md

- [x] 3.1 Delegate to a general-purpose subagent (caveman style mandatory). Pass these explicit instructions:
  - Read `docs/faq.md` line 1436 area. Change `$SHELL -ilc "which <cmd>"` → `$SHELL -lc "which <cmd>"`.
  - Append one sentence after the existing mitigation sentence: `-i omitted intentionally — interactive shell claims tty foreground group via tcsetpgrp and triggers SIGTSTP on pi parent at shell exit.`
  - Touch no other lines.

## 4. Update docs/service-bootstrap.md

- [x] 4.1 Delegate to a general-purpose subagent (caveman style mandatory). Pass these explicit instructions:
  - Change `$SHELL -ilc "which <cmd>"` → `$SHELL -lc "which <cmd>"` at lines 101 and 364 (table cell + code sample).
  - In the "Login shell fallback (macOS/Linux)" section (line 357 area), prepend one sentence: `Use -lc (login, non-interactive). -i forbidden — interactive shell claims tty foreground group, parent pi receives SIGTSTP on shell exit.`
  - Touch no other lines.

## 5. Update docs/file-index-shared.md

- [x] 5.1 Delegate to a general-purpose subagent (caveman style mandatory). Pass these explicit instructions:
  - Find the row for `packages/shared/src/platform/binary-lookup.ts`.
  - Append to the purpose field: ` See change: document-login-shell-non-interactive-fix.`
  - Touch no other rows.
  - **Implementation note**: no dedicated row exists for `packages/shared/src/platform/binary-lookup.ts`; `binary-lookup.ts` is documented as a sub-module of the `src/shared/platform/` row (line 50). Annotation appended there. Future agents grepping `binary-lookup.ts` in `docs/file-index-shared.md` will find the cross-reference.

## 6. Validate

- [x] 6.1 `npm test 2>&1 | tee /tmp/pi-test.log; grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log` — **6819 passed, 19 skipped, 0 failed** (442s).
- [x] 6.2 `grep -rn '\-ilc' docs/ README.md` — **zero matches**. (Two matches remain in `packages/shared/src/__tests__/binary-lookup.test.ts`: the new negative-assertion regex `expect(...).not.toMatch(/-i\b|-il\b|-ilc\b/)` and its explanatory comment — these are the invariant-locking mechanism, not regressions.)
- [x] 6.3 `grep -n '\-lc ' packages/shared/src/platform/binary-lookup.ts` → single match at line 620 (line number shifted from 601 by the new JSDoc block).
- [x] 6.4 Manual smoke (macOS, iTerm2): in a worktree, `unset PATH; export PATH=/usr/bin:/bin`; run `pi` (or a pi-spawn from the dashboard) so `whichViaLoginShell` is exercised (e.g. for `jj` when not installed). Confirm pi does NOT print `[1]+ Stopped pi` on startup. **Deferred — manual operator verification; core regression already covered by PR #49 and the new strengthened test.**
