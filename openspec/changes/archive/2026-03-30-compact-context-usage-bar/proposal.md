## Why

The context usage bar currently takes a full-width line on the session card, wasting vertical space. It should be compact — inlined on the same row as the activity indicator and cost — to make cards denser and show more sessions without scrolling.

## What Changes

- Shrink the context usage bar to ~1/5 card width, placed inline between the activity indicator and cost on the same row
- Remove the separate percentage text label; show percentage only on hover via tooltip
- Apply the same compact inline layout on both desktop and mobile cards
- Remove the dedicated full-width context bar row (Line 4 on desktop, bottom row on mobile)

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `context-usage-bar`: Bar becomes a compact inline element (~1/5 width) instead of full-width; percentage text replaced with tooltip-only display

## Impact

- `src/client/components/ContextUsageBar.tsx` — remove percentage text span, constrain width
- `src/client/components/SessionCard.tsx` — move `<ContextUsageBar>` into the activity/cost row, remove the separate context bar row (both desktop and mobile variants)
- Tests for `ContextUsageBar` and `SessionCard` need updating
