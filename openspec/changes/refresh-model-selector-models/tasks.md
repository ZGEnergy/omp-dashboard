## 1. ModelSelector refresh control

- [ ] 1.1 Add optional `onRefresh?: () => void` to `ModelSelector` props (`packages/client/src/components/ModelSelector.tsx`).
- [ ] 1.2 Add a `refreshing` local state; set true on refresh click, disable the control while true.
- [ ] 1.3 Clear `refreshing` when the `models` prop reference changes (new `models_list`) and via a short safety timeout, mirroring the existing `pendingModel` timeout pattern.
- [ ] 1.4 Render a footer refresh button (`mdiRefresh`, spins while `refreshing`) in the dropdown, only when `onRefresh` is provided.

## 2. Wire through StatusBar and App

- [ ] 2.1 Add `onRefresh?: () => void` to `StatusBar` props and forward it to `ModelSelector` (`packages/client/src/components/StatusBar.tsx`).
- [ ] 2.2 In `App.tsx`, pass `onRefresh={() => selectedId && send({ type: "request_models", sessionId: selectedId })}` to `StatusBar` — bypassing the `!modelsMap.has(sid)` guard by design.

## 3. Tests

- [ ] 3.1 Unit test (`ModelSelector.test.tsx`): activating the footer control calls `onRefresh`, disables while busy, and the control is absent when `onRefresh` is undefined.
- [ ] 3.2 Test that busy state clears on new `models` prop identity and on safety timeout.
- [ ] 3.3 Test the App-level handler sends `request_models` for the selected session even when `modelsMap` already has that session.

## 4. Verify

- [ ] 4.1 `npm test 2>&1 | tee /tmp/pi-test.log` — new specs pass, no regressions.
- [ ] 4.2 Client rebuild + restart (`npm run build` → `POST /api/restart`); manually confirm a live session's dropdown updates after authenticating a provider and clicking refresh.
