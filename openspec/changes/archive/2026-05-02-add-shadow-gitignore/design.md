## Context

`.pi/skills/jj-workspace/SKILL.md` documents that `.shadow/<name>/` is the conventional location for `jj workspace add` targets in this repo. These are sibling working copies of the same colocated jj+git repo. They contain their own `.git` directory (working tree) and full source checkouts.

The repo-root `.gitignore` already excludes other local-only directories (`node_modules/`, `dist/`, `.pi/proposal-queue.json`, build outputs) but does not currently list `.shadow/`. As a result, `git status` from the main worktree shows the entire `.shadow/` tree as untracked, and `git add .` would stage it.

## Goals / Non-Goals

**Goals:**
- Prevent accidental `git add` / `git commit` of jj workspace contents.
- Keep `git status` clean when jj workspaces exist alongside the main worktree.

**Non-Goals:**
- Changing jj behavior or jj workspace location (still `.shadow/`).
- Adding any tooling to create or manage workspaces.
- Modifying `.gitignore` files inside individual `.shadow/<name>/` workspaces (those are jj-managed).

## Decisions

**Decision: Use `.shadow/` (trailing slash) rather than `.shadow`.**
- Rationale: The trailing slash makes the intent explicit (directory only) and matches the existing `node_modules/` / `dist/` style in this `.gitignore`.
- Alternative considered: `.shadow` (no slash) — works identically in practice but is stylistically inconsistent with the surrounding entries.

**Decision: Place the entry next to other build/work-tree exclusions near the top of `.gitignore`.**
- Rationale: Keeps related exclusions grouped; reviewers scanning the file see all "local-only working directories" together.

## Risks / Trade-offs

- **[Risk]** A future contributor who genuinely needs to commit a file under `.shadow/` would be surprised → **Mitigation**: `.shadow/` is by convention reserved for jj workspaces; if that convention changes, this entry is trivially revertable.
- **[Trade-off]** No effect on already-tracked files (none exist today). If any `.shadow/...` paths were ever committed, they would remain tracked until explicitly `git rm`'d → acceptable; current `git ls-files .shadow/` is empty.

## Migration Plan

1. Add `.shadow/` line to `.gitignore`.
2. Verify `git status` no longer lists `.shadow/...` entries when a workspace exists.
3. No rollback steps needed beyond reverting the one-line edit.

## Open Questions

None.
