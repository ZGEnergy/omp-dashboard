# dashboard-server — login-shell tool-detection invariant

## ADDED Requirements

### Requirement: Login-shell tool-detection fallback MUST NOT spawn an interactive shell

When `ToolResolver.resolveSystemTool()` falls back to `whichViaLoginShell()` (step 4 of the managed-bin → extraBinDirs → PATH → login-shell chain), the spawned shell command MUST use `-lc` (login, non-interactive) and MUST NOT include `-i` (interactive).

**Rationale**: an interactive shell calls `tcsetpgrp(stdin_fd, shell_pgid)` on startup to claim the terminal's foreground process group. When that shell exits, the parent pi process is no longer in the foreground group; the tty driver delivers `SIGTSTP` and pi is suspended immediately after startup. This manifests as `[1]+ Stopped pi` in iTerm2 / macOS Terminal whenever the registry resolves a binary not on PATH (e.g. `jj` when not installed) and the login-shell fallback fires.

**Rule generalizes across shells** — `bash`, `zsh`, and `fish` all implement `tcsetpgrp` on interactive startup. The fallback uses `process.env.SHELL || "/bin/zsh"`; the no-`-i` rule applies regardless of which shell is selected.

#### Scenario: Login-shell fallback resolves a binary

- **WHEN** `useLoginShell: true` and a binary is not on PATH
- **THEN** `whichViaLoginShell()` invokes `execSync(\`${shell} -lc "which ${cmd}"\`, …)`
- **AND** the spawned command MUST NOT contain `-i`, `-il`, or `-ilc`
- **AND** the parent pi process MUST NOT receive `SIGTSTP` as a side effect

#### Scenario: Test enforces the invariant

- **WHEN** the `binary-lookup` test suite runs the `"tries login shell when enabled and PATH fails"` case
- **THEN** the captured shell command string is asserted with `expect(cmd).not.toMatch(/-i\b|-il|-ilc/)`
- **AND** the existing positive assertion that the resolved path equals the stubbed `/nvm/bin/pi` continues to pass

#### Scenario: Documentation reflects the invariant

- **WHEN** an agent greps `docs/faq.md` or `docs/service-bootstrap.md` for the login-shell fallback
- **THEN** every example uses `$SHELL -lc "which <cmd>"` (no `-i`)
- **AND** each section carries a one-line note explaining the SIGTSTP rationale
- **AND** the canonical code reference is `packages/shared/src/platform/binary-lookup.ts whichViaLoginShell()`
