# Document login-shell non-interactive fallback fix

## Why

Commit `c6cc2d33` ("fix: remove -i flag from whichViaLoginShell to prevent SIGTSTP") changed `whichViaLoginShell()` in `packages/shared/src/platform/binary-lookup.ts` from `$SHELL -ilc "which <cmd>"` to `$SHELL -lc "which <cmd>"`. The code + test changed, but four `docs/` references were missed and still describe the old `-ilc` invocation:

- `docs/faq.md:1436` — "Electron wizard detects tools using login shell fallback (`$SHELL -ilc \"which <cmd>\"`)"
- `docs/service-bootstrap.md:101` — "Login shell fallback (`$SHELL -ilc \"which <cmd>\"`)"
- `docs/service-bootstrap.md:357` — "Login shell fallback (macOS/Linux)" section preamble
- `docs/service-bootstrap.md:364` — embedded code sample `execSync(\`${shell} -ilc "which ${cmd}"\`, …)`

A future agent grepping these docs for "how does login-shell detection work" gets the wrong flag set and may reintroduce `-i`. The fix's rationale (why interactive mode breaks job control via `tcsetpgrp`) also lives **only in the commit message** — once the commit ages out of `git log -p` browsing, the next agent who sees `-lc` has no record of why `-i` is forbidden.

The `whichViaLoginShell()` function body itself has a one-line comment ("Resolve a command via login shell (picks up nvm/volta/homebrew paths)") that does not mention the SIGTSTP constraint. A well-meaning refactor to "improve detection by enabling interactive mode" would regress the fix silently — no test currently asserts the absence of `-i` beyond the indirect `cmd.includes("-lc")` check.

## What Changes

- **Add invariant comment block** above `whichViaLoginShell()` in `packages/shared/src/platform/binary-lookup.ts` documenting:
  1. The login (`-l`) flag is required to source `~/.zprofile` for nvm/volta/homebrew PATH entries on macOS/Linux GUI launches.
  2. The interactive (`-i`) flag must NOT be added: an interactive shell calls `tcsetpgrp()` to claim the terminal foreground process group, and on exit the parent pi process receives `SIGTSTP` from the tty driver — visible as `[1]+ Stopped pi` in iTerm2.
  3. Cross-reference: `See change: document-login-shell-non-interactive-fix` (post-archive).
- **Strengthen the existing test** `"tries login shell when enabled and PATH fails"` in `packages/shared/src/__tests__/binary-lookup.test.ts` to explicitly assert the spawned shell command does NOT contain `-i` (currently only the positive `cmd.includes("-lc")` check exists, which would match `-ilc` too).
- **Update `docs/faq.md`** — change the `$SHELL -ilc` references to `$SHELL -lc` and append a one-line note: `-i omitted intentionally; SIGTSTP on parent pi process. See: packages/shared/src/platform/binary-lookup.ts whichViaLoginShell()`.
- **Update `docs/service-bootstrap.md`** — three call sites (lines 101, 357, 364) get the same flag fix and a single anchor sentence in the "Login shell fallback" section explaining the no-`-i` rule.
- **Update `docs/file-index-shared.md`** row for `packages/shared/src/platform/binary-lookup.ts` to append `See change: document-login-shell-non-interactive-fix`.
- **No runtime behaviour change.** Code path already correct as of `c6cc2d33`; this proposal only locks in the invariant via comment + test + docs so future edits do not regress it.

## Capabilities

### Modified Capabilities

- `dashboard-server`: adds a new requirement — "Login-shell tool-detection fallback MUST NOT spawn an interactive shell" — codifying the no-`-i` rule. The capability already exists; this proposal extends it with a new requirement (delta uses `## ADDED Requirements` since no prior login-shell requirement exists in the main spec).

## Impact

- **Scope**: ~30 LOC across 5 files. Code: invariant comment + one extra `expect` line in test. Docs: 4 sed-like flag updates + one anchor sentence + one file-index annotation.
- **User-visible**: none. Pure documentation + defensive-test change.
- **Risk**: trivial. No code path changes; the test addition is a stricter assertion on an already-passing test.
- **Sequencing**: independent. Lands cleanly anywhere; should land alongside or immediately after PR #49 (`fix: remove -i flag from whichViaLoginShell to prevent SIGTSTP`) so the doc state matches the code state in a single develop snapshot.
- **Investigation context**: this proposal was drafted after rebasing PR #49 onto `develop` (clean, no conflicts), verifying the test suite green (17/17 in `binary-lookup.test.ts`), and grep-confirming that `-ilc` appears in **zero** `.ts/.tsx/.js/.mjs` files but **four** `docs/` files. The fix's correctness was confirmed by reading the only call site (`whichViaLoginShell` at `binary-lookup.ts:598`) and tracing its single caller (`ToolResolver.resolveSystemTool` step 4 at line 278). No other location in the repo spawns a login shell.
- **Out of scope**:
  - Touching the runtime fix itself (already merged via PR #49).
  - Adding `bash`/`fish` coverage (the function uses `process.env.SHELL || "/bin/zsh"`; bash and fish would have the same `tcsetpgrp` behaviour with `-i`, so the no-`-i` rule generalizes — but adding shell-specific tests is out of scope).
  - Refactoring the login-shell fallback to avoid spawning a shell entirely (e.g. parsing `~/.zprofile` directly). That's a much larger change and not required to lock in the current invariant.
