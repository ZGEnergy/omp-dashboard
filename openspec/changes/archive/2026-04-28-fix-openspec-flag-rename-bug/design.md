## Context

`detectOpenSpecActivity(toolName, args)` in `packages/shared/src/openspec-activity-detector.ts` is the **single source** that turns tool-execution events into `{ phase?, changeName?, isActive? }`. Its output is consumed only by `packages/server/src/event-wiring.ts`, which on receipt of a `changeName + isActive: true` writes:

1. `session.openspecChange = changeName`
2. (if `!attachedProposal`) `session.attachedProposal = changeName`
3. (if `!session.name?.trim()`) `session.name = changeName` and forwards a `rename_session` to the bridge.

The detector currently uses three CLI regexes whose capture group is `[^\s"']+`:

```
CLI_CHANGE_FLAG_RE = /openspec\s+\S+.*--change\s+["']?([^\s"']+)["']?/
CLI_ARCHIVE_RE     = /openspec\s+archive\s+["']?([^\s"']+)["']?/
CLI_NEW_CHANGE_RE  = /openspec\s+new\s+change\s+["']?([^\s"']+)["']?/
```

`[^\s"']+` happily captures `--help`, so an agent running `openspec archive --help` (a perfectly normal discovery command) ends up renaming an unnamed session to `--help` and attaching a phantom `--help` proposal.

Existing test coverage lives in `packages/extension/src/__tests__/openspec-activity-detector.test.ts` (232 lines) and already exercises the positive paths.

## Goals / Non-Goals

**Goals:**
- Stop returning `changeName` values that are obviously CLI flags (start with `-`).
- Keep the change surgical: one helper, one repo-shared file, one new test block.
- Preserve all existing positive-path behavior (real change names still extracted).

**Non-Goals:**
- Repairing already-corrupted sessions on disk. Users can rename / detach via the existing UI.
- Defense-in-depth at the rename / auto-attach site in `event-wiring.ts`. The detector is the contract; duplicating the check muddies ownership.
- Re-shaping the openspec CLI surface. We don't audit whether `openspec new change` or `--change <name>` are real subcommands — the `-` guard makes both safe whether they are or aren't.
- Touching the `read`/`write` `path` regexes (`CHANGE_PATH_RE`). A path segment can never be `--help` because the matcher requires `openspec/changes/<name>/`.

## Decisions

### Decision 1: Guard inside `detectOpenSpecActivity`, not via regex tightening

Rather than rewriting each CLI regex's character class (e.g. `[^\s"'-][^\s"']*`), add one branch at the top of the `tool === "bash"` arm that nulls out any match whose captured name starts with `-`.

**Why:**
- Three regexes → three places to keep in sync vs. one guard.
- Easier to read and review: the intent ("flags aren't change names") is named, not implied.
- Preserves the regexes verbatim for any future audit of the openspec CLI surface.

**Alternative considered:** Tighten each regex to `[^\s"'-][^\s"']*`. Rejected — equivalent behavior but noisier diff and easier to forget on future regex edits.

### Decision 2: Apply the guard only in the `bash` arm

`read` and `write` paths can't produce a `--help` change name (the path regex `openspec/changes/([^/]+)/` requires a literal `openspec/changes/` segment). Putting the guard in the bash arm — the only place it can fire — keeps the change minimal and the test surface obvious.

### Decision 3: Empty-string and whitespace already covered

The capture groups all use `[^\s"']+` (one-or-more), so empty matches don't reach the return path. No additional empty-name guard needed.

### Decision 4: No change to `event-wiring.ts`

The rename / auto-attach cascade is correct *given* an honest detector. Adding a second guard there would split the contract across two files for no benefit. If a future detector source ever appears, that's the time to add a second guard — not now.

## Risks / Trade-offs

- **[Risk]** A real openspec change is named starting with `-`. → **Mitigation**: openspec change names are kebab-case identifiers; a leading `-` is not valid input to `openspec new change` and would be filesystem-hostile. Acceptable.
- **[Risk]** Future regexes added to the bash arm forget the guard. → **Mitigation**: the guard runs *after* all regex branches against the resolved `name` variable, so it covers any new regex that funnels through the same return shape. (Implementation detail captured in tasks.md.)
- **[Trade-off]** We don't audit whether `openspec new change <name>` is a real subcommand. The fix tolerates either answer. If it isn't real, the regex is harmless after the guard; if it is real, behavior is preserved.

## Migration Plan

None. Pure bug fix in a pure helper. Already-corrupted sessions (name `"--help"`, attachedProposal `"--help"`) are user-fixable via the existing rename and detach controls; no data migration ships with this change.

## Open Questions

None blocking. The shape of the fix is fully constrained by the existing single-helper / single-consumer architecture.
