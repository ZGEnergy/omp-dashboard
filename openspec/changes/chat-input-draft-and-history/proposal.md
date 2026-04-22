## Why

Users lose in-progress chat input whenever they leave the chat view — opening Settings, OpenSpec previews, file diffs, or pi-resources unmounts `CommandInput` and discards the typed text. Switching sessions has the opposite bug: the input is kept mounted, so the draft "leaks" from one session into another. Additionally, there is no way to recall previously sent prompts within a session, which forces re-typing or copy-pasting from the chat log — a friction point especially for iterative prompting.

Both problems share a root cause: `CommandInput`'s `text` lives in unscoped local component state. Fixing them together keeps the input's state model coherent and avoids touching the same component twice.

## What Changes

- **Per-session draft persistence**: the typed-but-unsent text is keyed by `sessionId`, survives navigation away from the chat view, and never crosses over between sessions.
- **Draft storage**: text drafts are persisted in `localStorage` under `chat-draft:<sessionId>` so they also survive page reload; pasted images remain in-memory only (too large for localStorage, consistent with current image-paste behavior).
- **Draft cleared only on successful send** or when the user explicitly clears the field; if the optimistic prompt is cancelled the draft is restored.
- **Up/Down history recall**: `ArrowUp` / `ArrowDown` in the textarea walk through the current session's previously sent user prompts (including `/`-commands and `!`-shell lines), bash-style.
- **Bash-like trigger rules**: history navigation only activates when the dropdown is closed AND the caret is at the top row (for `ArrowUp`) or bottom row (for `ArrowDown`) of the textarea, so multiline editing is not disrupted.
- **Draft buffer during history walk**: when the user first presses `ArrowUp`, the current in-progress text is saved; walking past the newest history entry restores it.
- **Consecutive-duplicate suppression**: repeated identical prompts collapse to a single history entry.
- **History scope**: current session only, sourced from the already-loaded `messages[]` with `role: "user"` — no new server protocol, no localStorage for history.
- **Session switch cleanup**: outgoing session's draft is saved, incoming session's draft is loaded, history cursor is reset.

## Capabilities

### New Capabilities
- `chat-input-state`: lifecycle and persistence rules for the chat input's typed-but-unsent text (drafts) and for navigating previously sent user prompts (history recall) inside `CommandInput`.

### Modified Capabilities
<!-- None — command-autocomplete, chat-view, and image-paste remain unchanged at the requirement level. -->

## Impact

- **Code**:
  - `packages/client/src/components/CommandInput.tsx` — input becomes controlled (`text` lifted to parent via `draft` + `onDraftChange` props); add `sessionId`, `history`, and history-navigation keyboard handling.
  - `packages/client/src/App.tsx` — own the `drafts: Map<sessionId, string>` state, hydrate from `localStorage` on mount, persist on change (debounced), derive `history` from `selectedState.messages`.
  - `packages/client/src/components/__tests__/CommandInput.test.tsx` — expand coverage for draft + history behavior.
- **Storage**: new `localStorage` namespace `chat-draft:<sessionId>`. No server-side storage, no new protocol messages, no migration.
- **Dependencies**: none added.
- **Out of scope**: searchable history (Ctrl+R style), cross-session/cross-cwd history, mobile-specific history UI affordance, persistence of pending pasted images.
