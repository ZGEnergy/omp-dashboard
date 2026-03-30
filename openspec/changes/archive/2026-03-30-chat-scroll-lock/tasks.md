## 1. Scroll Lock Logic

- [x] 1.1 Add `isNearBottom` ref and `showScrollButton` state to ChatView
- [x] 1.2 Add `onScroll` handler that checks proximity to bottom (50px threshold), updates ref and button visibility state
- [x] 1.3 Make the existing auto-scroll `useEffect` conditional on `isNearBottom.current === true`

## 2. Scroll-to-Bottom Button

- [x] 2.1 Wrap the scroll container in a `relative` parent div
- [x] 2.2 Add a floating down-arrow button (absolute positioned, bottom-center) that is visible only when `showScrollButton` is true
- [x] 2.3 Button click handler: smooth-scroll to bottom, set `isNearBottom.current = true`, hide button

## 3. Tests

- [x] 3.1 Test: auto-scroll fires when near bottom (default behavior preserved)
- [x] 3.2 Test: auto-scroll does NOT fire when scrolled away from bottom
- [x] 3.3 Test: scroll-to-bottom button appears when not near bottom
- [x] 3.4 Test: scroll-to-bottom button hidden when near bottom
- [x] 3.5 Test: clicking scroll-to-bottom button calls scrollTo
