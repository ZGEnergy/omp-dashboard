## 1. Pure helper + tests (TDD)

- [x] 1.1 Add `selectedCardScrollFingerprint(selectedId, sessions, sessionOrderMap)` to `packages/client/src/components/SessionList.tsx` (or extract to `packages/client/src/lib/session-list-scroll.ts` if cleaner). Export it. — extracted to `packages/client/src/lib/session-list-scroll.ts`.
- [x] 1.2 Write unit tests in `packages/client/src/lib/__tests__/session-list-scroll.test.ts` — 9 cases covering null/stable/all four position fields/non-position fields/missing-order-map.
- [x] 1.3 Run the new test file in isolation, confirm it passes — 9/9 pass.

## 2. DOM addressing

- [x] 2.1 Add `data-session-id={session.id}` to the root element of `SessionCard` in `packages/client/src/components/SessionCard.tsx` — added to both mobile (`<li>` ~line 360) and desktop (`<li>` ~line 451) branches.
- [x] 2.2 Verify the attribute reaches the rendered DOM under `SortableSessionCard` — wrapper renders `{children}` straight through, attribute survives. Confirmed by render test in 4.1.

## 3. Auto-scroll wiring in `SessionList`

- [x] 3.1 Add a list-container ref in `SessionList` and attach it to the existing scrollable wrapper — `listRef` attached to `<div className="flex-1 overflow-y-auto">`.
- [x] 3.2 Compute `scrollFingerprint` via `useMemo`, deps `[selectedId, sessions, sessionOrderMap]`.
- [x] 3.3 Add `prevSelectedRef = useRef<string | undefined>(selectedId)` and `firstMountRef = useRef(true)`.
- [x] 3.4 Add a `useEffect` keyed on `[scrollFingerprint, selectedId]` implementing the three-branch logic (null → sync refs and noop; first-mount with selectedId → scroll; selectionChanged → noop; otherwise → scroll).
- [x] 3.5 Zero-render churn confirmed — effect contains no `setState` calls.

## 4. Behavioral tests

- [x] 4.1 Render test added at `packages/client/src/components/__tests__/SessionList.scroll.test.tsx` — 7 cases (deep-link, no-selection, user-click, background re-sort via order map, non-position field, click-then-resort, missing-from-sessions). All pass. Note: status-flip uses `sessionOrderMap` reorder rather than `status` change because the default-collapsed Ended bucket removes the card from DOM on `active→ended` (which is the spec-correct noop branch — covered indirectly by the missing-from-sessions test).
- [x] 4.2 Full `npm test` — 4287 passed, 9 skipped, 0 failures.

## 5. Quick manual QA

- [x] 5.1 Build client (`npm run build`) — succeeded. Restart deferred to user (curl interception in this env).
- [x] 5.2 Manual browser QA — user-confirmed pass: verify (a) clicking a session below the fold does NOT scroll the list; (b) ending an active session scrolls its card to the new position; (c) bridge reattach with `reattachPlacement` re-ordering scrolls the just-resumed selected card into view; (d) hiding a non-selected session does NOT scroll; (e) toggling hidden on the selected session scrolls if the card moves; (f) deep-link `/session/<id>` for a session below the fold scrolls the card into view on initial load.
- [x] 5.3 Manual mobile QA — user-confirmed pass: select a session, swipe back, observe the card is centered on the list view.

## 6. Docs

- [x] 6.1 AGENTS.md update SKIPPED — SessionList.tsx is not in the AGENTS.md "Key Files" backbone (per protocol, only architectural-backbone files belong there). Coverage moved to `docs/file-index-client.md`.
- [x] 6.2 `docs/architecture.md` Session list section reviewed — no scroll-behavior subsection exists; new behavior is documented at the file-index level.
- [x] 6.3 Two rows added to `docs/file-index-client.md` (subagent-delegated, caveman style): `src/client/components/SessionList.tsx` (auto-scroll behavior) and `src/client/lib/session-list-scroll.ts` (helper signature).

## 7. Validate + archive prep

- [x] 7.1 `openspec validate auto-scroll-selected-session-card` — PASS ("Change is valid").
- [x] 7.2 `.pi/skills/openspec-shared/scripts/effective-status.sh auto-scroll-selected-session-card` — all four artifacts (proposal/design/specs/tasks) report `done`.
