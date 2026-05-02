# Tasks

## 1. Parser

- [x] 1.1 In `packages/server/src/openspec-tasks.ts`, replace `CHECKBOX_RE` with
      a pattern whose numeric-id group is optional. Suggested shape:
      `^(- \[)([ xX])(\] +)(?:([0-9]+(?:\.[0-9]+)*) +)?(.*)$` so that the
      surrounding whitespace and the marker positions are addressable in the
      writer's `replace`.
- [x] 1.2 In `parseTasksMarkdown`, when the id capture group is absent, set
      `id = `L${lineNumber}`` (1-indexed line, matching the existing `line`
      field exactly). Keep `text` set to the captured remainder, trimmed.
- [x] 1.3 Update the file's leading docstring to document the new accepted
      shape (id optional). Replace the misleading "tasks.md uses a rigid
      line-level format" framing.

## 2. Writer (toggleTask)

- [x] 2.1 Update the rewrite branch of `toggleTask` to preserve the source line
      shape: if the parsed line had no numeric id, the rewritten line SHALL not
      introduce one. (Build the rewritten string from the regex's positional
      groups rather than a hardcoded `- [${marker}] ${m[2]} ${m[3]}` template.)
- [x] 2.2 Update the id-validation step so that when the source line has no
      numeric id, the request's `id` MUST equal `L<line>`. When the source line
      has a numeric id, behaviour is unchanged.
- [x] 2.3 Confirm `findGroupForLine` is unaffected (it scans for `## ` headings
      regardless of the checkbox shape).

## 3. Tests

- [x] 3.1 In `packages/server/src/__tests__/openspec-tasks.test.ts` (create if
      absent), add a case: `parseTasksMarkdown` of a fixture with three id-less
      checkboxes returns three tasks with ids `L<n>` matching their line
      numbers, and the existing scenarios with numeric ids still pass.
- [x] 3.2 Add a case: `parseTasksMarkdown` of a fixture mixing id-ed and
      id-less checkboxes returns both kinds with the right ids in source order.
- [x] 3.3 Add a case: `toggleTask` of an id-less line by `id="L<n>"` flips the
      marker, reads back identically (no synthetic id leaks into the file),
      and a follow-up `parseTasksMarkdown` returns the new state.
- [x] 3.4 Add a case: `toggleTask` of an id-less line with the wrong synthesized
      id (e.g. `id="L99"` vs. `line=4`) throws `LineMismatchError`.
- [x] 3.5 Add a case: `toggleTask` of an id-ed line with `id="L<n>"` instead of
      `id="1.1"` throws `LineMismatchError`.
- [x] 3.6 Run the existing route tests in
      `packages/server/src/routes/__tests__/openspec-routes.test.ts` (or the
      nearest equivalent) to confirm no regressions on the HTTP layer.

## 4. Spec update

- [x] 4.1 In `openspec/changes/relax-tasks-parser-id-optional/specs/openspec-task-toggle/spec.md`,
      add MODIFIED requirements that capture the loosened parser, the
      synthesized-id contract, the symmetric-writer rule, and the
      cross-pane count invariant (button count == popover row count).
- [x] 4.2 Run `openspec validate relax-tasks-parser-id-optional` and resolve
      any structural issues.

## 5. Manual verification

- [x] 5.1 Build and restart the server (`npm run build && curl -X POST
      http://localhost:8000/api/restart`).
- [x] 5.2 Open `add-darwin-x64-build` in the dashboard. The `Tasks 24/36`
      button SHALL now open a popover with 36 rows (24 ticked).
- [x] 5.3 Toggle one row in the popover. Confirm the on-disk file
      (`openspec/changes/add-darwin-x64-build/tasks.md`) flips the marker on
      the expected line and introduces no `L<n>`-style text.
- [x] 5.4 Repeat for `add-jj-workspace-plugin` (66 rows).
- [x] 5.5 Open any change with numeric ids (e.g. `fix-expanded-pinned-group-drag`)
      and confirm popover + toggle behaviour are unchanged.
