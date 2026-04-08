## Context

The dashboard supports forking sessions but only from the latest entry. Pi's `SessionManager` has `createBranchedSession(leafId)` which creates a new session file containing only the root→target path. This enables forking from any point in a conversation.

Currently, chat messages in the client carry synthetic IDs (`msg-{index}`) with no link back to pi's session entry IDs. The server spawns forks via `pi --fork <sessionFile>` which always forks from the last entry.

## Goals / Non-Goals

**Goals:**
- Users can fork a session from any user or assistant message in ChatView
- Entry IDs flow from session entries through events to client chat messages
- Server creates a pruned session file when forking from a specific entry

**Non-Goals:**
- Full tree picker UI (pi's TUI-style tree selector with branches)
- Branch visualization across sessions
- Forking from tool calls, model changes, or thinking blocks

## Decisions

### 1. Entry ID propagation via event data

Attach `entryId` to the `data` payload of `message_start` and `message_end` events in `state-replay.ts`. The same field is already available on live events from the extension's flow event wiring — the entry's `id` field.

**Why**: Minimal change — just add one field to existing event payloads. No protocol schema changes needed since `data` is `Record<string, unknown>`.

**Alternative**: Separate API endpoint to fetch entry-to-message mapping. Rejected — adds complexity and a round-trip.

### 2. Server-side branched session creation using pi's SessionManager

When `resume_session` includes an `entryId`, the server calls:
```
SessionManager.open(sessionFile) → createBranchedSession(entryId)
```
This produces a new session file with only root→target entries. Then spawn `pi --fork <prunedFile>`.

**Why**: `createBranchedSession` is a built-in pi SDK method designed for exactly this. The server already has the session file path.

**Alternative**: Manual JSONL surgery in `session-file-reader.ts`. Rejected — duplicates logic that pi already provides and risks divergence.

### 3. Fork button on user and assistant messages only

Show a fork icon button on hover for `user` and `assistant` role messages (turn boundaries). Not on tool calls, thinking, or other intermediate message types.

**Why**: Turn boundaries are the natural fork points — they represent complete conversational states. Forking mid-tool-execution would create broken state.

### 4. entryId tracks the assistant message's entry (the turn boundary)

For each user message, store the `entryId` from `message_start`. For each assistant message, store the `entryId` from `message_end`. The fork button uses this `entryId`.

**Why**: The entry ID from `message_end` represents the complete turn — the last entry before the next user input. This is the natural branching point.

## Risks / Trade-offs

- **Pi SDK dependency on server** — `SessionManager` is imported from `@mariozechner/pi-coding-agent`. Already a dependency of the project. → Low risk.
- **Entry ID missing on live events** — Live `message_start`/`message_end` events forwarded from the extension may not include `entryId` in their data payload. → Need to verify and add if missing. Fallback: fork button only appears on replayed messages (acceptable MVP).
- **Stale session file** — If the session file was modified after events were replayed, the entry ID might not match. → `createBranchedSession` will throw if ID not found — handle gracefully with error message.
