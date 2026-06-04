---
name: jj-uncommit-to-working-copy
description: >
  In a jj-colocated git repo, take a jj commit (default `@-`, the parent of
  the working copy) and fold its changes into the working copy as
  undescribed changes — equivalent to "uncommitting" so they re-appear as
  unstaged changes in `git status`. NEVER calls `git reset`, `git checkout`,
  or any other mutating git command. Use when: the user says "uncommit",
  "put changes back as unstaged", "undo last jj commit", "move commit into
  working copy", "unstage from jj", or has a described jj commit they want
  to re-stage / re-split / amend differently.
license: MIT
metadata:
  source: pi-agent-dashboard
  version: "1.0"
---

# Uncommit a jj revision back into the working copy

Folds the changes from a target jj revision into `@` (the working copy
commit) and clears `@`'s description. The result: the target commit's
diff is now in the working copy, with no description, and `git status`
shows the files as unstaged. The original target commit is squashed
(becomes empty) and its descendants are rebased automatically by jj.

> ⚠️ **This skill never invokes `git reset`, `git checkout`, `git stash`,
> or any other mutating git command.** All operations go through jj.
> The git working tree updates because jj is colocated.

## When to use this

- The user has a described jj commit they want to redo / re-split.
- An agent committed too eagerly; user wants to amend differently.
- The user wants `git diff` / `git status` to reflect the changes
  unstaged, e.g. so they can `git add -p` selectively, or hand the
  diff to a different tool.

If the user wants to rewrite the **description** without moving files,
use `jj describe` instead. If they want to **drop** the changes, use
`jj abandon`. This skill is specifically for "put changes back where I
can edit/restage them".

## Refusal preconditions

```bash
# 1. Repo must be jj-colocated
test -d .jj && test -d "$(jj workspace root)/.git" || \
  { echo "Not a jj-colocated repo. Aborting."; exit 1; }

# 2. No unresolved conflicts in the working copy or its ancestry
[ -z "$(jj resolve --list 2>/dev/null)" ] || \
  { echo "Unresolved conflicts. Run 'jj resolve' first."; exit 1; }

# 3. Git index must be clean
#    (Same reason as jj-workspace-fold-back: staged blobs are invisible
#     to jj and a rebase would silently strand them.)
git diff --cached --quiet || \
  { echo "Git index is dirty. See refusal message below."; exit 1; }
```

### Why a dirty git index is fatal here

Identical to `jj-workspace-fold-back`: jj has no concept of staging.
If `jj squash` runs while the index has staged blobs, the staged
content is left pointing at a tree jj never saw. The next `git commit`
creates a git-only commit and history bifurcates.

When the index is dirty, **do not auto-fix**. Tell the user:

```
The git index has staged changes. In a jj-colocated repo, the staging
area is invisible to jj — staged content cannot be folded back. Pick one:

  ❌ Don't:  git stash         (forbidden — corrupts jj history)

  ✓  Safe:   git reset         Clears the index. Files on disk are
                               untouched. jj's view is unchanged because
                               jj never reads the index.

  ✓  jj way: jj new -m "WIP"   Set the current work aside as a real
                               jj change. Then start fresh on top.
                               (`jj edit <change-id>` returns to it later.)
```

Then exit the skill. Re-invoke after the user has resolved it.

## Default flavor: uncommit `@-` into `@`

This is the most common case — the user's last described commit is
`@-` and they want it back as working-copy changes.

```bash
TARGET="${1:-@-}"   # default: parent of working copy

# Step 1: capture pre-op id for rollback
PRE_OP="$(jj op log -T 'id.short() ++ "\n"' --limit 1 --no-pager | head -1)"

# Step 2: refuse if the target IS @ (no-op) or is the trunk root
TARGET_REV="$(jj log -r "$TARGET" --no-graph --no-pager -T 'change_id.short()' --limit 1 2>/dev/null)"
WC_REV="$(jj log -r '@' --no-graph --no-pager -T 'change_id.short()' --limit 1)"
if [ -z "$TARGET_REV" ]; then
  echo "Revision '$TARGET' not found. Aborting."; exit 1
fi
if [ "$TARGET_REV" = "$WC_REV" ]; then
  echo "Target is the working copy itself. Use 'jj describe -m \"\"' to clear the description, or pick a different revision."
  exit 1
fi

# Step 3: warn if the target has a bookmark pointing at it
BOOKMARKS_AT_TARGET="$(jj bookmark list -r "$TARGET" -T 'name ++ "\n"' --no-pager 2>/dev/null | tr -d '\n' | sed 's/$//')"
if [ -n "$BOOKMARKS_AT_TARGET" ]; then
  echo "Warning: bookmarks at $TARGET — squashing will move them."
  echo "  $BOOKMARKS_AT_TARGET"
  echo "Continue anyway? (Ctrl-C to abort)"
  read -r _
fi

# Step 4: squash the target's diff into @
if ! jj squash --from "$TARGET" --into @; then
  echo "Squash failed. Restoring pre-op state."
  jj op restore "$PRE_OP"
  exit 1
fi

# Step 5: clear @'s description so the changes read as plain working-copy
jj describe -m '' --no-edit 2>/dev/null || jj describe -m ''

# Step 6: report
echo "Uncommitted $TARGET into working copy."
echo
echo "Working copy now contains:"
jj diff -r @ --summary
echo
echo "git status sees:"
git status --short
```

## Variants

### Uncommit a specific revision (not `@-`)

```bash
# User passes a change-id, commit-id, bookmark name, or revset:
bash uncommit-to-wc.sh xnmsxzos
bash uncommit-to-wc.sh 'description("feat: rail")'
```

The default target is `@-` but any single-revision revset works. If the
revset matches multiple revisions the script aborts with an error so the
user can narrow it.

### Uncommit a range of commits (`mode: range`)

Use only when the user explicitly asks for "uncommit the last N
commits" or "uncommit everything since main".

```bash
RANGE="${1:?usage: bash uncommit-range-to-wc.sh '<revset>'}"
PRE_OP="$(jj op log -T 'id.short() ++ "\n"' --limit 1 --no-pager | head -1)"

# Squash each commit in the range, oldest-first, into @
for REV in $(jj log -r "$RANGE" --reversed --no-graph --no-pager -T 'change_id.short() ++ "\n"'); do
  if ! jj squash --from "$REV" --into @; then
    echo "Squash of $REV failed; rolling back."
    jj op restore "$PRE_OP"; exit 1
  fi
done

jj describe -m ''
```

Caveat: range mode collapses all descriptions. The user is opting in
to lose them. If they want to keep them, they should split the work
manually (`jj split`).

## After successful uncommit

The original target commit is empty (or rebased away if abandon-empty
is on). The working copy now carries those changes, undescribed. Common
next steps the user might want:

- `git add -p` then `git commit` (creates a git-only commit; jj will
  observe it on next snapshot — fine, this is the standard colocated
  workflow).
- `jj split` to carve the working copy into multiple new described
  commits.
- `jj describe -m "..."` to give the working copy a description.

Do not run any of the above automatically — the whole point of this
skill is to hand control back to the user.

## Recovery

`jj op restore <op-id>` undoes any operation. `jj op log` lists recent
operations with their ids. The skill captures `PRE_OP` before any
mutation, so a single `jj op restore "$PRE_OP"` returns the repo to
its pre-skill state — including any rebased descendants.

## Why this exists separately from `jj-workspace-fold-back`

`jj-workspace-fold-back` ships work outward to `origin`; this skill
moves work inward to the working copy. Opposite directions, both
needed, kept separate so neither bloats with the other's edge cases.
