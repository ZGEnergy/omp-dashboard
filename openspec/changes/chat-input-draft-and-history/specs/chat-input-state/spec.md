## ADDED Requirements

### Requirement: Per-session draft text persistence

The chat input SHALL preserve typed-but-unsent text on a per-session basis. The draft for session `S` SHALL be retained when the user navigates to any view that unmounts the chat area (Settings, OpenSpec preview, file diff view, pi resources view, readme preview, archive browser, or any other `detailPanel` branch) and SHALL be re-displayed when the user returns to the chat view with session `S` selected. The draft for session `S` SHALL NOT appear in any other session's input.

#### Scenario: Draft survives navigation to Settings
- **WHEN** the user has typed "hello world" into the chat input for session A and then navigates to the Settings panel
- **THEN** on returning to session A's chat view the input SHALL contain "hello world"

#### Scenario: Draft does not leak between sessions
- **WHEN** the user has typed "foo" into the chat input for session A and then switches to session B
- **THEN** session B's chat input SHALL show session B's draft (empty if none) and SHALL NOT show "foo"

#### Scenario: Draft survives a page reload
- **WHEN** the user has typed "remember me" into the chat input for session A and then reloads the page
- **THEN** after reconnecting and selecting session A, the chat input SHALL contain "remember me"

#### Scenario: Draft cleared on successful send
- **WHEN** the user sends the current draft text via the Send button or Enter key
- **THEN** the draft for that session SHALL be cleared from both in-memory state and persistent storage

#### Scenario: Pasted image drafts are NOT persisted
- **WHEN** the user has pasted an image into the input and then navigates away or reloads
- **THEN** the pasted image SHALL NOT be restored (images remain in-memory only for the lifetime of the mounted component)

### Requirement: Draft storage location

Chat input drafts SHALL be persisted in `window.localStorage` under keys of the form `chat-draft:<sessionId>`. Writes SHALL be debounced to avoid thrashing during typing. On application mount, all existing `chat-draft:*` keys SHALL be loaded into an in-memory map keyed by session id.

#### Scenario: Draft key naming
- **WHEN** a draft for session `abc-123` is persisted
- **THEN** it SHALL be stored under the `localStorage` key `chat-draft:abc-123`

#### Scenario: Hydration on mount
- **WHEN** the application mounts and `localStorage` contains `chat-draft:abc-123` = "hi" and `chat-draft:def-456` = "bye"
- **THEN** the in-memory drafts map SHALL contain `{"abc-123": "hi", "def-456": "bye"}` before any user interaction

#### Scenario: Debounced write
- **WHEN** the user types multiple characters in quick succession
- **THEN** `localStorage.setItem` SHALL NOT be invoked on every keystroke; it SHALL be invoked at most once per debounce window

### Requirement: History recall for sent user prompts

Within a session, the user SHALL be able to recall previously sent user prompts using the `ArrowUp` and `ArrowDown` keys in the chat input. The history source SHALL be the current session's chat messages filtered to `role === "user"`. Consecutive duplicate entries SHALL collapse to a single history entry. History SHALL NOT cross session boundaries.

#### Scenario: Recall the most recent prompt
- **WHEN** the chat input is empty and the user presses `ArrowUp` (with the caret at the top row and no autocomplete dropdown open)
- **THEN** the input SHALL be populated with the most recently sent user prompt in this session

#### Scenario: Walk further back in history
- **WHEN** the input already shows history entry `N` and the user presses `ArrowUp` again
- **THEN** the input SHALL be populated with history entry `N + 1` (the next older prompt), bounded by the oldest available entry

#### Scenario: Walk forward toward current draft
- **WHEN** the input shows history entry `N` (N > 0) and the user presses `ArrowDown`
- **THEN** the input SHALL be populated with history entry `N - 1` (the next newer prompt)

#### Scenario: Walk past the newest entry restores in-progress draft
- **WHEN** the input shows the newest history entry and the user presses `ArrowDown`
- **THEN** the input SHALL be restored to the in-progress draft that was active when the user first entered history mode

#### Scenario: Consecutive duplicates are collapsed
- **WHEN** the user has sent "ping" three times in a row and then presses `ArrowUp` from an empty input
- **THEN** a single `ArrowUp` press SHALL land on "ping" and a second `ArrowUp` press SHALL land on the prompt before "ping" — not on "ping" again

#### Scenario: History does not cross sessions
- **WHEN** session A contains sent prompts ["X", "Y"] and session B contains sent prompts ["P", "Q"], and the user is on session B
- **THEN** pressing `ArrowUp` from empty input SHALL walk B's history ("Q", then "P") and SHALL never surface "X" or "Y"

#### Scenario: Slash commands and shell lines are in history
- **WHEN** the user has sent `/compact`, `!ls`, and `fix the bug` in that order
- **THEN** all three SHALL appear in history, retrievable via `ArrowUp`

### Requirement: In-progress draft buffer during history navigation

When the user first enters history mode (first `ArrowUp` press that triggers a recall), the input's current content SHALL be saved as the "in-progress draft". Walking forward past the newest history entry with `ArrowDown` SHALL restore the in-progress draft. Pressing `Escape` while in history mode SHALL also restore the in-progress draft and exit history mode. Any editing keystroke (other than `ArrowUp`/`ArrowDown`/`Escape`) while in history mode SHALL exit history mode without further restoration (the user is now editing the recalled entry).

#### Scenario: Draft is saved on entering history mode
- **WHEN** the input contains "half-typed" and the user presses `ArrowUp` to enter history mode
- **THEN** "half-typed" SHALL be preserved as the in-progress draft for later restoration

#### Scenario: Draft is restored on leaving history past the newest entry
- **WHEN** the user is at the newest history entry after having entered history from "half-typed" and presses `ArrowDown`
- **THEN** the input SHALL contain "half-typed" and history mode SHALL be exited

#### Scenario: Escape restores the draft
- **WHEN** the user is at any history entry after having entered history from "half-typed" and presses `Escape`
- **THEN** the input SHALL contain "half-typed" and history mode SHALL be exited

#### Scenario: Editing a recalled entry exits history mode without restoration
- **WHEN** the user has recalled a history entry "fix bug X" and starts editing it to "fix bug Y"
- **THEN** history mode SHALL be exited and subsequent `ArrowUp` presses (from the appropriate caret position) SHALL start a new history walk based on the edited text

### Requirement: History navigation must not interfere with multiline editing or autocomplete

`ArrowUp` / `ArrowDown` key presses SHALL activate history navigation only when ALL of the following conditions are true:

1. No autocomplete dropdown is currently open (no `/`-command list, no `@`-file list).
2. No pending prompt is awaiting server response.
3. The caret is a single (non-selection) position.
4. For `ArrowUp`: the caret is on the first visual line of the textarea (at or before the first newline character, if any).
5. For `ArrowDown`: the caret is on the last visual line of the textarea (at or after the position following the last newline character, if any).

When any condition is false, the key event SHALL NOT be intercepted, and the textarea's native behavior (cursor movement between lines, or dropdown navigation) SHALL apply.

#### Scenario: Multiline editing is preserved
- **WHEN** the input contains "line one\nline two\nline three" and the caret is on "line two"
- **THEN** pressing `ArrowUp` SHALL move the caret to "line one" (native behavior), NOT trigger history recall

#### Scenario: Autocomplete dropdown takes priority
- **WHEN** the `/`-command dropdown is open and the user presses `ArrowUp`
- **THEN** the dropdown selection SHALL move (existing behavior), NOT history recall

#### Scenario: History activates at first line
- **WHEN** the input contains "one\ntwo" and the caret is inside "one" (first line)
- **THEN** pressing `ArrowUp` SHALL trigger history recall (not native caret movement, since there is no line above)

### Requirement: Session switch resets history navigation state

When the selected session changes, the chat input SHALL reset its history-navigation state: history cursor SHALL be cleared (`null`), and the in-progress draft buffer used for history navigation SHALL be cleared. The displayed draft text SHALL switch to the incoming session's stored draft.

#### Scenario: History cursor resets on session switch
- **WHEN** the user has walked to history entry 2 in session A and then switches to session B
- **THEN** on returning to session A later, pressing `ArrowUp` from A's draft SHALL start a fresh history walk at the newest entry (not resume at entry 2)

#### Scenario: Incoming session's draft is displayed
- **WHEN** session A has draft "foo" and session B has draft "bar", and the user switches from A to B
- **THEN** the chat input SHALL immediately show "bar"
