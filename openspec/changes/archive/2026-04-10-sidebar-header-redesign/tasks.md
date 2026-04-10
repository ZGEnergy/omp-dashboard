## 1. Tests

- [x] 1.1 Add/update tests verifying the header renders two rows with correct control placement (row 1: app-level, row 2: filters)
- [x] 1.2 Verify existing tests still pass for all 10 controls (presence, click handlers, conditional rendering)

## 2. Layout Restructure

- [x] 2.1 Split the header `div` in `SessionList.tsx` into two rows: row 1 (π, ThemePicker, ThemeToggle, TunnelButton, InstallButton, headerExtra, Settings) and row 2 (Active only, Show hidden, Pin+)
- [x] 2.2 Apply compact padding to row 1 and normal padding to row 2, keeping single `border-b` on the outer container
- [x] 2.3 Verify all controls remain functional — toggles, navigation, conditional rendering of InstallButton and ServerSelector
