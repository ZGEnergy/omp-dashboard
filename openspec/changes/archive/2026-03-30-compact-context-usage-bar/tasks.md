## 1. ContextUsageBar compact mode

- [x] 1.1 Add `compact` boolean prop to `ContextUsageBar` — when true: hide percentage text span, use fixed `w-16` width instead of `flex-1`
- [x] 1.2 Update `ContextUsageBar` tests: compact mode renders no percentage text, tooltip still shows percentage and token counts

## 2. Desktop SessionCard inline layout

- [x] 2.1 Move `<ContextUsageBar compact>` into the activity/cost row (Line 3) between `ActivityIndicator` and cost, remove the separate Line 4 context bar `div`
- [x] 2.2 Update desktop SessionCard tests to verify bar is in the same row as activity and cost

## 3. Mobile SessionCard inline layout

- [x] 3.1 Move `<ContextUsageBar compact>` into the mobile card's Line 2 (model/activity/cost row), remove the separate bottom context bar `div`
- [x] 3.2 Update mobile SessionCard tests to verify inline layout
