## 1. Refresh callback wiring

- [x] 1.1 Add `onRefresh` callback prop to `SessionHeader` component
- [x] 1.2 Wire `onRefresh` in `App.tsx`: clear session state to `createInitialState()`, remove from `subscribedRef`, send `subscribe` with `lastSeq: 0`

## 2. Desktop UI

- [x] 2.1 Add refresh icon button to desktop `SessionHeader` after the duration badge
- [x] 2.2 Add spinning state: track `refreshing` boolean, spin icon on click, clear after 500ms timeout

## 3. Mobile UI

- [x] 3.1 Add "Refresh Chat" option to `MobileActionMenu`
- [x] 3.2 Wire mobile refresh to the same `onRefresh` callback

## 4. Tests

- [x] 4.1 Add test for refresh button rendering in `SessionHeader`
- [x] 4.2 Add test that `onRefresh` callback is called on click
