## 1. Draft storage helper (pure / TDD first)

- [x] 1.1 Create `packages/client/src/lib/draft-storage.ts` exporting pure helpers: `readAllDrafts(): Map<string, string>` (scans `localStorage` for `chat-draft:` prefix), `writeDraft(sessionId, text): void`, `deleteDraft(sessionId): void`, and the constant `DRAFT_KEY_PREFIX = "chat-draft:"`. Each function SHALL wrap `localStorage` access in try/catch to tolerate private-mode or quota errors (fail silently, return empty Map on read error).
- [x] 1.2 Add `packages/client/src/lib/__tests__/draft-storage.test.ts` with cases: empty storage → empty Map; multiple `chat-draft:*` keys → populated Map; non-matching keys ignored; `writeDraft` + `readAllDrafts` round-trip; `deleteDraft` removes only the target key; throwing `setItem` does not crash.
- [x] 1.3 Run `npm test -- draft-storage` and confirm all cases pass.

## 2. History derivation helper (pure / TDD first)

- [x] 2.1 Create `packages/client/src/lib/message-history.ts` exporting `extractUserPromptHistory(messages: ChatMessage[]): string[]`. Rules: filter to `role === "user"`, map to `.content` (skip empty/undefined), collapse consecutive duplicates, return in reverse chronological order (index 0 = newest).
- [x] 2.2 Add `packages/client/src/lib/__tests__/message-history.test.ts` covering: empty input → empty array; mixed roles → only user messages; consecutive dupes collapsed; non-consecutive dupes preserved; ordering is newest-first; empty/whitespace-only contents skipped.
- [x] 2.3 Run `npm test -- message-history` and confirm all cases pass.

## 3. Lift draft state into `App.tsx`

- [x] 3.1 In `packages/client/src/App.tsx`, add `const [drafts, setDrafts] = useState<Map<string, string>>(() => readAllDrafts())` (hydrated once from `localStorage` via the helper from task 1).
- [x] 3.2 Add a debounced persistence effect: when `drafts` changes, schedule a `writeDraft` per dirty key (and `deleteDraft` for any empty-string value). Reuse existing debounce pattern or a ~300 ms inline `setTimeout` cleared on each keystroke.
- [x] 3.3 Derive `const selectedDraft = selectedId ? (drafts.get(selectedId) ?? "") : "";` and `const selectedHistory = useMemo(() => extractUserPromptHistory(selectedState.messages), [selectedState.messages]);`.
- [x] 3.4 Wire new props into `<CommandInput ... sessionId={selectedId} draft={selectedDraft} onDraftChange={(t) => setDrafts((m) => { const n = new Map(m); if (selectedId) n.set(selectedId, t); return n; })} history={selectedHistory} />`.
- [x] 3.5 In `wrappedHandleSend` (or the existing `handleSend` path), on successful send clear the draft: `setDrafts((m) => { const n = new Map(m); if (selectedId) n.delete(selectedId); return n; }); deleteDraft(selectedId)`.

## 4. Convert `CommandInput` to a controlled component with history

- [x] 4.1 In `packages/client/src/components/CommandInput.tsx`, add new props to the `Props` interface: `sessionId?: string`, `draft?: string`, `onDraftChange?: (text: string) => void`, `history?: string[]`.
- [x] 4.2 Replace `const [text, setText] = useState("")` with a pattern that prefers the controlled `draft` prop when provided: keep local fallback for backward-compat in tests that don't pass `draft`. Every place that currently calls `setText(v)` SHALL also call `onDraftChange?.(v)`.
- [x] 4.3 Add internal state: `const [historyIndex, setHistoryIndex] = useState<number | null>(null)` and `const savedDraftRef = useRef<string>("")`.
- [x] 4.4 Add a `useEffect` on `sessionId` that resets `historyIndex` to `null` and `savedDraftRef.current` to `""` on change.
- [x] 4.5 Implement caret-position helpers: `isCaretOnFirstLine(textarea, value): boolean` and `isCaretOnLastLine(textarea, value): boolean`. Both SHALL return false when `selectionStart !== selectionEnd`.
- [x] 4.6 In `handleKeyDown`, after the existing dropdown-handling block and before the `Enter`-to-send block, add history-navigation branches:
  - `ArrowUp` + `!dropdownMode` + `!pendingPrompt` + `isCaretOnFirstLine` + `history.length > 0`: `preventDefault()`. If `historyIndex === null`, snapshot current text to `savedDraftRef.current`. Set `historyIndex = Math.min((historyIndex ?? -1) + 1, history.length - 1)`. Call `setText(history[historyIndex])` and `onDraftChange`.
  - `ArrowDown` + `!dropdownMode` + `!pendingPrompt` + `isCaretOnLastLine` + `historyIndex !== null`: `preventDefault()`. If `historyIndex === 0`, exit history mode: `setHistoryIndex(null); setText(savedDraftRef.current); onDraftChange(...)`. Otherwise decrement `historyIndex` and load the corresponding entry.
  - `Escape` while `historyIndex !== null` (and no dropdown): `preventDefault()`, restore `savedDraftRef.current`, set `historyIndex = null`.
- [x] 4.7 Ensure that any `onChange` or `onInput` that modifies the text while `historyIndex !== null` resets `historyIndex` to `null` (user is now editing the recalled entry).
- [x] 4.8 Verify that `handleSend` clears text via the controlled-prop path and that the auto-resize logic still works (`inputRef.current.style.height = "38px"`).

## 5. Update/extend `CommandInput` tests

- [x] 5.1 In `packages/client/src/components/__tests__/CommandInput.test.tsx`, add tests for controlled behavior: passing `draft="foo"` renders "foo" in the textarea; typing calls `onDraftChange` with the new value.
- [x] 5.2 Add tests for history recall: render with `history=["msg2","msg1"]`, place caret at start, press `ArrowUp` → textarea shows "msg2"; press `ArrowUp` again → "msg1"; press `ArrowDown` → "msg2"; press `ArrowDown` again → restored draft.
- [x] 5.3 Add tests for no-interference conditions: (a) caret on middle line of multiline text + `ArrowUp` → textarea value unchanged; (b) `/` dropdown open + `ArrowUp` → dropdown selection changes, not history; (c) empty `history` array + `ArrowUp` at top → no-op.
- [x] 5.4 Add test for `Escape` exiting history mode and restoring the draft.
- [x] 5.5 Add test for consecutive-duplicate collapse (indirectly via the `extractUserPromptHistory` unit tests in task 2, plus one integration check that a `history=["a","a","b"]` input is already collapsed by the parent — document that `CommandInput` expects pre-deduped history).
- [x] 5.6 Run `npm test -- CommandInput` and confirm all pass.

## 6. Integration wiring verification

- [x] 6.1 Add a new integration test file `packages/client/src/__tests__/chat-input-draft-integration.test.tsx` (or extend an existing App-level test) that renders App, switches between two sessions, and asserts that each session's draft is preserved independently in the rendered textarea.
- [x] 6.2 Add a test that simulates unmounting the chat view (e.g., navigating to a Settings route in the test harness, if reachable) and re-mounting it, asserting the draft reappears.
- [x] 6.3 Add a `localStorage`-hydration test: pre-seed `localStorage` with `chat-draft:abc`="hi", mount App, select session `abc`, assert textarea shows "hi".
- [x] 6.4 Run `npm test` for the full client suite and confirm no regressions. *(3 pre-existing failures in `resolve-jiti`/`cli-parse` unrelated to this change, verified present on clean `develop`.)*

## 7. Documentation

- [x] 7.1 Update `AGENTS.md`: add `CommandInput.tsx` notes mentioning draft + history props; add entries for `lib/draft-storage.ts` and `lib/message-history.ts` in the Key Files table.
- [x] 7.2 Update `docs/architecture.md` with a short section describing the `chat-draft:<sessionId>` `localStorage` convention and the derivation-from-messages approach for history.
- [x] 7.3 Update `README.md` if the keyboard-shortcuts section exists; otherwise add a brief "Keyboard shortcuts in chat input" subsection mentioning `ArrowUp` / `ArrowDown` / `Escape` for history.

## 8. Manual verification

- [x] 8.1 Run `npm run build && curl -X POST http://localhost:8000/api/restart` (or `npm run dev`) and exercise the two motivating scenarios: (a) type text in session A, open Settings, return — draft survives; (b) reload page, return to session A — draft survives; (c) press `ArrowUp` in a session with history — prompts walk correctly; (d) switch sessions mid-history-walk — incoming session shows its own draft, history is reset.
- [x] 8.2 Verify no regression in autocomplete: `/` dropdown `ArrowUp`/`ArrowDown` still navigates the list; `@` file picker unaffected.
- [x] 8.3 Verify multiline editing: typing shift+enter to create multiple lines, `ArrowUp` in the middle moves caret between lines (does not trigger history).
