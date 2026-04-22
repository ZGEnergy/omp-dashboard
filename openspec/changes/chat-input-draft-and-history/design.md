## Context

`CommandInput` (`packages/client/src/components/CommandInput.tsx`) keeps the user's typed text in a local `useState("")`. The chat area that renders it is mounted only in the chat branch of `App.tsx`'s `detailPanel` (see `App.tsx:~893`): any branch change (Settings, OpenSpec preview, FileDiff, PiResources, etc.) unmounts the whole subtree and discards the draft. Session switching is the opposite — the component stays mounted, so the draft leaks across sessions.

Previously-sent user prompts already exist in `sessionStates.get(sessionId).messages[]` with `role: "user"` (see `event-reducer.ts:14,83,351`). The history feature therefore needs **no new server protocol** and **no new persistence** — it is a pure client-side read from in-memory state that is already hydrated via the `subscribe` replay.

Pasted images are tracked by a separate hook (`useImagePaste`) inside `CommandInput`. They are transient (cleared on successful send) and can be large (base64 PNG/JPEG). This change **does not** attempt to persist them.

## Goals / Non-Goals

**Goals:**
- Draft text is scoped per session and survives navigating away from the chat view and page reload.
- Draft text NEVER crosses between sessions (no leakage).
- `ArrowUp` / `ArrowDown` recall previously sent user prompts inside the current session, bash-style.
- In-progress draft is preserved when the user enters history mode and restored when they walk past the end.
- Existing `/`-command and `@`-file autocomplete behavior is untouched when the dropdown is open.
- Existing multi-line editing (shift-enter, line navigation with ↑/↓ between rows) is untouched.

**Non-Goals:**
- Searchable history (`Ctrl+R`).
- Cross-session / cross-cwd history.
- Server-side storage or new WebSocket messages.
- Persistent pasted-image drafts.
- Mobile-only history UI (no visible arrow button / gesture in this change).
- History entries for assistant or tool messages.

## Decisions

### Decision 1: Lift `text` state to the parent (`App.tsx`) — `CommandInput` becomes controlled

**Chosen**: Parent owns a `drafts: Map<sessionId, string>` and passes `draft` + `onDraftChange` props to `CommandInput`. The textarea `value` binds to `draft`.

**Alternatives considered**:
- *Keep `text` local, read `sessionId` in a `useEffect` that saves/loads on change.* — Fragile: requires careful ordering between the `useEffect` and the `setState` that follows a prop change, and still doesn't solve the "unmount on settings" case.
- *Store draft inside `sessionStates`.* — Would couple UI-only state to the event-sourced `SessionState`. Drafts are strictly client-side UX concerns and shouldn't appear in reducers.

**Rationale**: Lifting state is the canonical React pattern for shared persistence across mount cycles. Owning the `Map` in `App.tsx` lets us hydrate once from `localStorage` on mount and write back on change, without polluting session-domain state.

### Decision 2: Persist drafts in `localStorage` under `chat-draft:<sessionId>`

**Chosen**: One key per session. Lazy hydration: on mount, scan `localStorage` once for the `chat-draft:` prefix and build the `Map`. Writes are debounced (~300 ms) to avoid thrashing during typing.

**Alternatives considered**:
- *Single `drafts` JSON object under one key.* — Simpler read, but every keystroke rewrites every draft. Scales badly if user has many sessions.
- *`sessionStorage` (tab-scoped).* — Loses drafts on reload, which was one of the motivating bugs.
- *In-memory only.* — Loses drafts on reload; no worse than today but doesn't solve the reported problem.

**Rationale**: Per-session keys scale O(1) on write, support targeted eviction (e.g. delete when session is archived), and are already the dominant pattern in the codebase (`theme`, `show-debug-tools`, `sidebarState`, etc.). Debouncing keeps per-keystroke cost negligible.

### Decision 3: Clear draft only on successful send (and restore on pending-prompt cancel)

**Chosen**: `handleSend` clears the draft in-memory and in `localStorage` only after invoking `onSend`. If the optimistic prompt is cancelled (`handleCancelPending`), we do **not** attempt to restore — the user already saw their text hit the chat as a pending bubble and can copy it back if needed. (This matches current behavior — nothing is regressed.)

**Rationale**: Simplest model that matches user intent ("I hit send, so it's gone"). Restoring on cancel would require snapshotting the pre-send text and re-hydrating async; the marginal UX win doesn't justify the complexity.

### Decision 4: History is derived from `sessionStates[sid].messages.filter(role === "user")`

**Chosen**: Compute `history: string[]` with `useMemo` in `App.tsx` from the selected session's messages — filter to `role === "user"`, extract `.content`, collapse consecutive duplicates. Pass as a prop to `CommandInput`.

**Alternatives considered**:
- *Maintain a separate `sentPrompts` array in local state, appended in `handleSend`.* — Would miss history from sessions hydrated via replay after reload.
- *Persist history in `localStorage`.* — Redundant: messages are already persisted server-side and streamed on subscribe.

**Rationale**: Single source of truth. When a session is re-subscribed after reload, the history automatically becomes available as the `user` messages replay into state.

### Decision 5: Bash-style trigger conditions for `ArrowUp` / `ArrowDown`

**Chosen**: History navigation activates if ALL of:
1. `dropdownMode === null` (no `/`-command or `@`-file dropdown open — those already own ↑/↓).
2. `pendingPrompt` is false.
3. For `ArrowUp`: caret is on the **first line** of the textarea — specifically `selectionStart` is ≤ the index of the first `\n` (or there is no `\n`). And `selectionStart === selectionEnd` (no active selection).
4. For `ArrowDown`: caret is on the **last line** — `selectionStart` is ≥ the index after the last `\n`. And `selectionStart === selectionEnd`.

If the conditions aren't met, the key event is NOT intercepted, so the textarea's native cursor-between-lines behavior works normally.

**Rationale**: Matches bash/zsh convention. Non-interference with multiline editing is a hard requirement — breaking it would be worse than not shipping history at all.

### Decision 6: History cursor model with preserved draft buffer

State inside `CommandInput`:
- `historyIndex: number | null` — `null` means "not in history mode". `0` is the newest entry, `history.length - 1` is the oldest.
- `savedDraftRef: useRef<string>("")` — captures the in-progress text when history mode is first entered.

Transitions:

```
    historyIndex = null                          ArrowUp @ top
    draft = "hello"  ──────────────────────────────────────────▶  historyIndex = 0
                                                                   savedDraftRef = "hello"
                                                                   draft = history[0]

    historyIndex = 0             ArrowUp @ top (if history.length > 1)
    draft = history[0]  ────────────────────────────────────▶    historyIndex = 1
                                                                   draft = history[1]

    historyIndex = k            ArrowDown @ bottom (k > 0)
    draft = history[k]  ────────────────────────────────────▶    historyIndex = k - 1
                                                                   draft = history[k - 1]

    historyIndex = 0            ArrowDown @ bottom
    draft = history[0]  ────────────────────────────────────▶    historyIndex = null
                                                                   draft = savedDraftRef.current

    historyIndex != null        any other key (not Up/Down/Esc)
    ─────────────────────────────────────────────────────────▶   historyIndex = null
                                                                   (keep current draft — user is editing)
```

**Escape** while in history mode: exit history mode and restore `savedDraftRef`.
**Session switch**: reset `historyIndex` to `null` and `savedDraftRef` to `""`. The new session's draft is loaded from the parent.

### Decision 7: History content includes slash commands and shell lines

`/compact`, `/new`, `!ls`, etc. are all sent via the same `onSend(text)` → they appear as `role: "user"` messages. Treating them uniformly matches terminal history semantics. No filtering.

### Decision 8: Reset history state on session switch via `useEffect` on `sessionId`

When the `sessionId` prop changes:
- Reset `historyIndex` to `null`.
- Reset `savedDraftRef` to `""`.
- The textarea's `value` flips automatically because `draft` comes from the parent's `Map`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `localStorage` quota exhaustion with thousands of session drafts. | Prefix scan on mount allows a future "prune drafts older than N days" pass. For now, typical users have dozens of sessions, not thousands. |
| Controlled-textarea re-renders every keystroke. | React's textarea handles this efficiently; we're not adding anything on top of the existing `setState` per keystroke. The debounce applies only to `localStorage` writes, not to re-renders. |
| History nav triggering accidentally while editing multiline content. | Strict caret-position gate (first line for ↑, last line for ↓). When in doubt, fall through to native behavior. |
| User expects "draft" to include pasted images. | Documented as out of scope in proposal; current behavior (images lost on any unmount) is unchanged, not regressed. |
| Existing `escape`-dismiss of autocomplete dropdown conflicts with new `escape`-exit of history mode. | Ordering: the dropdown-dismiss handler already runs only when `dropdownMode` is set. History-exit runs in the `else` branch. Mutually exclusive by construction. |
| Long prompts consume large `localStorage` per key. | Practical ceiling: a single session's draft is bounded by what a human types. Aggregate quota risk stays in the "prune old drafts" backlog. |

## Migration Plan

None required. No schema, no server changes, no protocol changes.

On first mount after deploy:
- No stored drafts exist → behavior is identical to today until the user types.
- After the user types in one session and navigates away, the draft is retained.

Rollback: remove the code; stored `chat-draft:*` keys become orphaned but are harmless (they sit in `localStorage` until manually cleared or the browser evicts them under pressure).

## Open Questions

None blocking. Possible future extensions, **explicitly deferred**:
- `Ctrl+R` incremental history search.
- Visible mobile affordance (small ↑ button above the textarea) — useful where no physical arrow keys exist. Tracked as future work, not part of this change.
- Cross-session history scoped to the same cwd.
- Persisted per-session pending images.
