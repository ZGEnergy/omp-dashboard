## 1. Pure helper + tests (TDD)

- [ ] 1.1 Add `selectedCardScrollFingerprint(selectedId, sessions, sessionOrderMap)` to `packages/client/src/components/SessionList.tsx` (or extract to `packages/client/src/lib/session-list-scroll.ts` if cleaner). Export it.
- [ ] 1.2 Write unit tests in `packages/client/src/lib/__tests__/session-list-scroll.test.ts` (or co-located): null for missing selection, null for selection-not-in-sessions, stable string for unchanged inputs, differs on `status` flip, differs on `hidden` toggle, differs on `cwd` change, differs on order-index change, stable when only `currentTool` / `tokensIn` / `tokensOut` / `cost` / `model` change.
- [ ] 1.3 Run the new test file in isolation, confirm it passes.

## 2. DOM addressing

- [ ] 2.1 Add `data-session-id={session.id}` to the root element of `SessionCard` in `packages/client/src/components/SessionCard.tsx` (both desktop and mobile branches if they diverge).
- [ ] 2.2 Verify the attribute reaches the rendered DOM under `SortableSessionCard` (dnd-kit wrapper does not strip arbitrary `data-*` props).

## 3. Auto-scroll wiring in `SessionList`

- [ ] 3.1 Add a list-container ref in `SessionList` and attach it to the existing scrollable wrapper.
- [ ] 3.2 Compute `scrollFingerprint` via `useMemo`, deps `[selectedId, sessions, sessionOrderMap]`.
- [ ] 3.3 Add `prevSelectedRef = useRef<string | undefined>(selectedId)` for prev-selectedId tracking AND `firstMountRef = useRef(true)` for the deep-link one-shot.
- [ ] 3.4 Add a `useEffect` keyed on `[scrollFingerprint]` that:
  - Returns early if `scrollFingerprint` is `null`.
  - Captures `selectionChanged = prevSelectedRef.current !== selectedId`, then updates `prevSelectedRef.current = selectedId`.
  - On first run (`firstMountRef.current === true`): if `selectedId` is set, scroll; flip `firstMountRef.current = false`. Then return.
  - On subsequent runs: if `selectionChanged` (user clicked or programmatic switch), DO NOT scroll — just return.
  - Otherwise (background re-sort of unchanged selection): run `listRef.current?.querySelector('[data-session-id="..."]')` and call `el?.scrollIntoView({ block: "nearest", behavior: "auto" })`.
- [ ] 3.5 Confirm zero-render churn: the effect MUST NOT call `setState`.

## 4. Behavioral tests

- [ ] 4.1 Add a render test in `packages/client/src/components/__tests__/SessionList.scroll.test.tsx` (vitest + RTL) that mocks `Element.prototype.scrollIntoView`, mounts `SessionList` with two sessions, then:
  - Asserts that mounting WITH `selectedId` set triggers exactly one `scrollIntoView({ block: "nearest", behavior: "auto" })` on the matching `[data-session-id]` (deep-link case).
  - Asserts that mounting WITHOUT `selectedId` triggers no `scrollIntoView`.
  - Asserts that flipping the selected session's `status` after mount triggers `scrollIntoView` with `behavior: "auto"`.
  - Asserts that changing `selectedId` post-mount (user click) triggers NO `scrollIntoView`.
  - Asserts that changing `selectedId` then flipping the new selection's `status` DOES trigger `scrollIntoView` (prev-ref was updated correctly).
  - Asserts no `scrollIntoView` call when only `currentTool` changes.
  - Asserts no `scrollIntoView` call when the selected card is filtered out by `sessionSearch`.
- [ ] 4.2 Run `npm test 2>&1 | tee /tmp/pi-test.log` and `grep -nE 'FAIL|✗' /tmp/pi-test.log` to verify no regressions.

## 5. Quick manual QA

- [ ] 5.1 Build client (`npm run build`) and restart server (`curl -X POST http://localhost:8000/api/restart`).
- [ ] 5.2 Verify: (a) clicking a session below the fold does NOT scroll the list (selection changes silently, user keeps their scroll position); (b) ending an active session scrolls its card to the new position instantly; (c) bridge reattach with `reattachPlacement` re-ordering scrolls the just-resumed selected card into view; (d) hiding a non-selected session does NOT scroll; (e) toggling hidden on the selected session scrolls if the card moves; (f) deep-link `/session/<id>` for a session below the fold scrolls the card into view on initial load.
- [ ] 5.3 Mobile QA via `MobileShell`: select a session, swipe back, observe the card is centered on the list view.

## 6. Docs

- [ ] 6.1 Update `AGENTS.md`'s `SessionList.tsx` row to mention the auto-scroll behavior (one sentence) and reference the change name `auto-scroll-selected-session-card`.
- [ ] 6.2 Update `docs/architecture.md` Session list section if/where it describes scroll behavior. Skip if no relevant section exists.
- [ ] 6.3 If the helper was extracted to its own file, add a row to the appropriate `docs/file-index-<area>.md` split.

## 7. Validate + archive prep

- [ ] 7.1 `openspec validate auto-scroll-selected-session-card` — must pass.
- [ ] 7.2 `.pi/skills/openspec-shared/scripts/effective-status.sh auto-scroll-selected-session-card` — confirm all artifacts done.
