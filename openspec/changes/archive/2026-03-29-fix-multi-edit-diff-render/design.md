## Context

`EditToolRenderer` currently extracts `args.oldText` and `args.newText` to render a unified diff. The Edit tool also supports an `edits[]` array for multiple disjoint replacements in one call. When `edits[]` is used, `oldText`/`newText` are absent and the renderer falls back to raw JSON.

## Goals / Non-Goals

**Goals:**
- Render colored diffs for the `edits[]` array format
- Reuse the existing `DiffView` component with no modifications

**Non-Goals:**
- Producing a single unified diff across all edits (we don't have the full file content)
- Collapsible or labeled edit sections (keep it simple: stacked diffs with separators)

## Decisions

**Render each edit independently**: Each entry in `edits[]` gets its own `DiffView`. We don't have the original file content to merge them into one unified diff, and independent rendering is simpler.

**Thin separator between edits**: A `border-t` divider between stacked `DiffView` components. No labels like "Edit 1/3" — keeps it clean.

**Three-branch rendering logic**: The renderer checks in order:
1. `args.oldText` + `args.newText` → single DiffView (existing)
2. `args.edits` array → map to multiple DiffViews
3. Fallback → raw JSON

## Risks / Trade-offs

- [Each mini-diff shows its own `--- / +++` header] → Acceptable; headers provide context and the file path is already shown above.
- [No line numbers in context] → Same limitation as existing single-edit diffs; `createTwoFilesPatch` treats each snippet as a standalone file.
