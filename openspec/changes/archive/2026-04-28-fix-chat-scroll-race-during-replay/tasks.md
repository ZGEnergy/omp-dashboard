## 1. Tests first

- [x] 1.1 In `packages/client/src/components/__tests__/`, add `ChatView.scroll-race.test.tsx` (jsdom). Mount `<ChatView>` with empty state, then update with messages in two ticks. Synthesize a `handleScroll` event between ticks where `scrollHeight - scrollTop - clientHeight > SCROLL_THRESHOLD` and assert the floating scroll-to-bottom button is NOT visible (i.e. `isNearBottom` stayed true).
- [x] 1.2 Add a second test: after the 150 ms suppression window elapses (advance fake timers), simulate a real user scroll-up event and assert the floating button DOES appear.
- [x] 1.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm both new tests fail with the current implementation. *(Test 1.1 failed as expected — racing onScroll showed the button. Test 1.2 already passed pre-fix because the original handleScroll always wrote isNearBottom from any scroll event. Both are now meaningful: 1.1 catches the bug, 1.2 documents that the fix doesn't break real scroll-up detection.)*

## 2. Implement guard

- [x] 2.1 In `packages/client/src/components/ChatView.tsx`, add an early-return at the top of `handleScroll`: if `programmaticScroll.current` is true, do nothing.
- [x] 2.2 Extract a small helper inside the component, e.g. `markProgrammatic()`, that sets `programmaticScroll.current = true` and schedules a 150 ms `setTimeout` clear. Capture the timeout id in a ref so it can be cleared on re-trigger.
- [x] 2.3 Call `markProgrammatic()` immediately before each programmatic `scrollTo` in the session-switch effect (both branches: restore-position and scroll-to-end).
- [x] 2.4 Call `markProgrammatic()` immediately before the programmatic `scrollTo` in the auto-scroll-on-new-content effect. *(Also dropped the redundant `&& !programmaticScroll.current` gate on this effect: chasing must continue across replay batches; scrollToTurn already opts out by setting `isNearBottom.current = false`.)*
- [x] 2.5 In a `useEffect` cleanup on unmount, clear any pending suppression timeout.

## 3. Verify

- [x] 3.1 Run `npm test 2>&1 | tee /tmp/pi-test.log`; confirm new tests pass and no existing tests regress. *(All 26 ChatView tests pass. The 2 failing tests in `packages/server/src/__tests__/browse-endpoint.test.ts` are pre-existing and unrelated — they cover `listDirectories` `isGit`/`isPi` flag detection in the in-flight `split-browse-flags` change.)*
- [x] 3.2 Manual repro: with `pi-dashboard --dev`, switch to a long uncached session and confirm the view lands at the latest message and the floating button is hidden.
- [x] 3.3 Manual sanity: scroll up mid-conversation in an active session — confirm scroll-lock still engages within ~1 frame of the user's gesture.
- [x] 3.4 Run `openspec validate fix-chat-scroll-race-during-replay --strict`.

## 4. Documentation

- [x] 4.1 If the fix touches behavior described in `AGENTS.md`'s `ChatView.tsx` row, update the description to mention "race-safe across multi-batch replay".
- [x] 4.2 Add a one-line entry under `## [Unreleased]` in `CHANGELOG.md` (Fixed section).
