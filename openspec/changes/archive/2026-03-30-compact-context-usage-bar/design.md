## Context

Session cards display a full-width context usage progress bar on its own row. This wastes vertical space. The bar should be compact and inline with existing content (activity indicator + cost) on a single row.

Current layout (desktop Line 3–4):
```
| ActivityIndicator          $1.23 |   ← Line 3
| [████████░░░░░░░░░░░░░░] 42%   |   ← Line 4 (full-width bar)
```

Target layout (merged into one line):
```
| ActivityIndicator  [████░░] $1.23 |  ← Single line
```

## Goals / Non-Goals

**Goals:**
- Merge context usage bar into the activity/cost row on both desktop and mobile
- Bar takes ~1/5 of card width, positioned between activity indicator and cost
- Remove standalone percentage text; show it only in tooltip on hover
- Reduce card height by one row

**Non-Goals:**
- Changing bar color thresholds (green/yellow/red zones stay the same)
- Changing the ContextUsageBar component API beyond adding an optional `compact` prop or similar

## Decisions

1. **Inline the bar via CSS width constraint, not a new component**
   The existing `ContextUsageBar` gets a `compact` boolean prop. When true: no percentage text, fixed `w-16` (~1/5 card width). This avoids duplicating component logic.
   _Alternative_: Create a separate `CompactContextUsageBar` — rejected as unnecessary duplication.

2. **Layout order: Activity (flex-1) → Bar (fixed) → Cost (shrink-0)**
   Activity indicator gets `flex-1` to fill remaining space. Bar has fixed small width. Cost stays right-aligned. This keeps the bar visually centered between the two text elements.

3. **Tooltip for percentage**
   The bar's container `div` already has a `title` attribute with usage details. In compact mode, this is the only way to see the percentage. No additional tooltip library needed.

## Risks / Trade-offs

- [Very narrow bar may be hard to read at extreme values] → The color coding (green/yellow/red) still communicates status even when the bar is small. Tooltip provides exact numbers.
- [Breaking existing tests that assert percentage text] → Tests will be updated to check tooltip instead.
