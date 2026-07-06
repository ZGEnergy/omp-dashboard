# Tasks

## 1. Pure grouping helper (TDD)
- [x] 1.1 Write `packages/client/src/lib/__tests__/group-tool-bursts.test.ts` first: formation (≥3 members), sub-threshold **verbatim emit** (incl. intermediate transparents in original order), empty-`assistant` transparent vs non-empty prose HARD boundary, `user`/`interactiveUi`/`bashOutput`/`inlineTerminal` boundary, running-member inclusion, prose-between-identical-calls does NOT over-merge (finding 2), nested `×N` inside a burst, count-over-underlying-calls vs threshold-over-members (finding 5). Verify RED.
- [x] 1.2 Implement `packages/client/src/lib/group-tool-bursts.ts`: `groupToolBursts(messages: ChatMessage[]): (ChatMessage | ToolBurstGroup)[]` — **burst-outer**: walk RAW messages with own boundary rules, then call `groupConsecutiveToolCalls` on each burst's members so `×N` nests. `groupConsecutiveToolCalls` stays untouched. Export `ToolBurstGroup` (carry stable `id` = first member id). Mirror the semantic helper's `lastToolEnd` verbatim-emit path. Make tests GREEN.

## 2. Component
- [x] 2.1 `packages/client/src/components/ToolBurstGroup.tsx`: header (spinner/check, `Working`/`N tool calls`, `N done`, live-command chip, breakdown+duration), scrollbox body rendering members via `ToolCallStep` and nested `CollapsedToolGroup` for `×N` members.
- [x] 2.2 Lifecycle (finding 4): `const [override,setOverride]=useState<boolean|null>(null); const expanded = override ?? isRunning;` — derived, auto-collapses on done, manual toggle pins via `setOverride`. No effect.
- [x] 2.3 Prefs gating: filter members via `toolCallPrefKey` + `useDisplayPrefs`; render `null` if zero visible; count reflects visible only.
- [x] 2.4 **Export** `getSummary` + `toolSummaries` from `CollapsedToolGroup.tsx` (currently module-local, finding 8) or lift to a shared module; extend the map beyond `bash/read/edit/write` so `kb_search`/`glob`/`git` don't degrade to a bare tool name in the live-command chip. DRY, no duplicate map.

## 3. Wire into ChatView
- [x] 3.1 In `ChatView.tsx`, replace the current `groupConsecutiveToolCalls(filteredMessages)` `useMemo` with `groupToolBursts(filteredMessages)` (burst-outer calls the semantic helper internally); render `<ToolBurstGroup>` for burst items, unchanged paths for the rest. **Key each burst by its first-member `id`, NOT positional `idx`** (finding 3 — current `key={group-${idx}}` bleeds collapse state under event-trim).
- [x] 3.2 Scroll-lock: confirm follow still tracks bottom while a live burst GROWS; additionally handle the auto-collapse SHRINK (finding 9) — when the user is not pinned to bottom, preserve the scroll anchor so the running→done collapse does not jump content.

## 4. Verify
- [x] 4.1 `npm test` green (new + existing chat tests, incl. `group-tool-calls.test.ts` unchanged).
- [x] 4.2 `openspec validate group-tool-call-bursts --strict` passes.
- [x] 4.3 Docs: add `group-tool-bursts.ts` + `ToolBurstGroup.tsx` rows to the nearest `AGENTS.md`; note the two-axis composition + `See change: group-tool-call-bursts`.
- [x] 4.4 Playwright E2E scenario (`tests/e2e/`): a burst collapses; expand shows scrollbox; running header shows `N done` + live command.
