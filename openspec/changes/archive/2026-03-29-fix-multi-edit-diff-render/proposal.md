## Why

The `EditToolRenderer` only handles the single `oldText`/`newText` format. When the Edit tool uses the `edits[]` array format (multiple disjoint replacements), the renderer falls back to dumping raw JSON — no syntax-highlighted diffs are shown.

## What Changes

- Handle `args.edits` array in `EditToolRenderer` by rendering a `DiffView` for each edit entry
- Stack multiple diffs vertically with a thin separator between them
- Preserve existing single-edit behavior unchanged
- Fall back to raw JSON only when neither format is present

## Capabilities

### New Capabilities

_(none — this is a bug fix within an existing capability)_

### Modified Capabilities

- `tool-renderers`: Add multi-edit diff rendering support to the Edit tool renderer

## Impact

- **Code**: `src/client/components/tool-renderers/EditToolRenderer.tsx` — small addition (~10-15 lines)
- **Dependencies**: None new; reuses existing `DiffView` component and `diff` library
- **Risk**: Low — additive change, existing single-edit path untouched
