## 1. Tests

- [x] 1.1 Add test: unattached Explore and New Change rows appear when session is alive with no attached proposal
- [x] 1.2 Add test: unattached OpenSpec section hidden when session is ended
- [x] 1.3 Add test: unattached OpenSpec section hidden when a proposal is attached

## 2. Implementation

- [x] 2.1 Add `exploreOpen` and `newChangeOpen` state to MobileActionMenu
- [x] 2.2 Add unattached OpenSpec section with Explore and + New Change menu rows (gated by `!attached && isAlive && onSendPrompt`)
- [x] 2.3 Render ExploreDialog and NewChangeDialog via DialogPortal outside the menu dropdown
- [x] 2.4 Verify all tests pass
