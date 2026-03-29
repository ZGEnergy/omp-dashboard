## 1. Tests

- [x] 1.1 Add test for `EditToolRenderer` rendering stacked diffs when `args.edits` array is provided
- [x] 1.2 Add test confirming single `oldText`/`newText` still renders a single DiffView
- [x] 1.3 Add test confirming fallback to raw JSON when neither format is present

## 2. Implementation

- [x] 2.1 Extract `edits` array from `args` in `EditToolRenderer` and render a `DiffView` per entry with `border-t` separators
- [x] 2.2 Verify in the running dashboard that multi-edit tool calls display colored diffs
