## Why

**This is a bug-fix change.** The Tasks popover (`TasksPopover.tsx`) renders
"No tasks." for changes whose `tasks.md` was authored without `1.1`-style
numeric id prefixes — even when the **same file** parses cleanly for the
openspec CLI, which feeds the button label `Tasks 24/36`.

Concrete reproduction (current trunk, May 2 2026):

| Change | `tasks.md` checkboxes | Numeric ids | Button label | Popover body |
|---|---|---|---|---|
| `add-darwin-x64-build` | 36 (24 ticked) | 0 | `Tasks 24/36` | `No tasks.` |
| `add-jj-workspace-plugin` | 66 (62 ticked) | 0 | `Tasks 62/66` | `No tasks.` |

Root cause is one over-strict regex in `packages/server/src/openspec-tasks.ts`:

```ts
const CHECKBOX_RE = /^- \[([ xX])\] +([0-9]+(?:\.[0-9]+)*)\s+(.*)$/;
//                                    ^^^^^^^^^^^^^^^^^^^^^
//                                    REQUIRED numeric id
```

OpenSpec's actual format does **not** require numeric ids. Cross-references:

- The openspec CLI's task counter accepts any `^- \[[ xX]\]` line — that's why the
  button shows `24/36` while the popover sees zero.
- The R3 rule in `packages/shared/src/openspec-design-evidence.ts`
  (`evaluateLocalDesignSatisfaction`) treats `^\s*-\s+\[[ xX]\]\s` as a satisfying
  task, also no id required.
- `.pi/skills/openspec-shared/scripts/effective-status.sh` uses the same id-less
  pattern (`grep -E '^\s*-\s+\[[ xX]\]\s'`).

The dashboard internalized one author's habit (`- [ ] 1.1 Foo`) as a hard
requirement, but the OpenSpec ecosystem itself does not enforce it. Two of the
38 currently-active changes hit the bug today; every future id-less change will
hit it too.

## What Changes

### 1. Loosen `CHECKBOX_RE` — make the numeric id optional

In `packages/server/src/openspec-tasks.ts`, the `CHECKBOX_RE` SHALL accept top-level
checkbox lines with **or without** a numeric `1.1`-style id prefix. When no id is
present, the parser SHALL synthesize a stable id from the 1-indexed line number
in the form `L<line>` (e.g. `L17`).

The id remains opaque to the client — it's used as a React key, a `data-testid`
suffix, and an optimistic-concurrency token in the toggle round-trip. The
**`line` field continues to be the byte-level concurrency token**; the id
synthesis affects only the string the client passes back to the toggle endpoint.

Indented checkboxes (`  - [ ]`) remain ignored to preserve the existing "top-level
only" contract. That's a separate concern; this change is scoped to id-optional.

### 2. Symmetric writer update — `toggleTask` rewrite

In the same file, `toggleTask`'s rewrite logic SHALL preserve the line shape
byte-for-byte:

- If the source line had a numeric id, the rewritten line SHALL retain it.
- If the source line had no id, the rewritten line SHALL NOT introduce one.

The id-validation step (`if (m[2] !== id) throw new LineMismatchError()`) SHALL
account for synthesized ids: when the file line has no numeric id, the request's
`id` MUST equal `L<line>` (the canonical synthesized form for that line).

### 3. Spec update — `openspec-task-toggle`

Modify the existing spec to:

- Document that the parser accepts id-less checkboxes and synthesizes `L<line>` ids.
- Add scenarios for both id-ed and id-less round-trips.
- Tighten the existing "Tasks button shows counts" scenario so that the count
  the button displays MUST equal the number of rows the popover would render
  for the same file (no more silent disagreement).

### 4. Tests

Add unit tests under `packages/server/src/__tests__/openspec-tasks.test.ts`:

- Parser: id-less checkboxes parse with synthesized `L<line>` ids.
- Parser: mixed id-ed and id-less in the same file both parse.
- Toggle: round-trip an id-less task — read returns `id="L4"`, POST with
  `id="L4"` succeeds, file rewrite preserves the id-less shape.
- Toggle: round-trip an id-ed task — existing behaviour unchanged.
- Toggle: passing `id="L4"` against a line that **does** have a numeric id
  returns `409 LineMismatchError` (and vice-versa).

No client changes are needed: `TasksPopover.tsx` already treats `id` as opaque.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `openspec-task-toggle`: Loosen the parser contract so `tasks.md` files
  authored without numeric `1.1`-style id prefixes are first-class citizens,
  and tighten the cross-pane invariant so the Tasks-button count and the
  popover body always agree about what counts as a task.

## Impact

- **Affected code**: `packages/server/src/openspec-tasks.ts` (regex + rewrite).
- **Affected specs**: `openspec/specs/openspec-task-toggle/spec.md`.
- **No protocol changes**, no client changes, no API surface changes.
- **Backwards compatible**: every currently-parseable file (numeric ids) still
  parses identically. Files that previously parsed to zero tasks will start
  parsing to N tasks — the user-visible effect is "the Tasks button now opens a
  populated popover instead of an empty one", which is the bug fix.
- **Two active changes immediately benefit**: `add-darwin-x64-build`,
  `add-jj-workspace-plugin`. No data migration needed — re-poll picks up
  unchanged.
