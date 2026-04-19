## Why

When a user clicks "Fork from here" on a message in the dashboard, the new session frequently ends one entry too early — the clicked message is missing, or a wrong message appears as the last one.

Root cause: pi core persists entries to the session tree via `sessionManager.appendMessage()` **only on `message_end`**, after emitting the event to listeners. The bridge extension captures `entryId` via `getLeafId()`, but the timing is wrong for two reasons:

1. **Assistant messages**: The bridge used to capture on `message_end` *before* `appendMessage` ran (same synchronous tick as `_emit`). A prior fix deferred this via `queueMicrotask`. ✅ Fixed.
2. **User messages**: The bridge captures on `message_start`, which runs **before any `appendMessage` at all** (user entries are also persisted at their own `message_end`). The captured leaf is the *previous* turn's entry. Forking from a user bubble therefore ends at the preceding assistant message, dropping the user's prompt. For the very first user message, `getLeafId()` returns null and fork silently misbehaves. ❌ Still broken.

The client `event-reducer` compounds the issue: it reads `entryId` from `message_start` for user messages and from `message_end` for assistant messages — asymmetric and wrong for users.

## What Changes

- **Symmetrize bridge entryId capture**: `message_end` attaches `entryId` (via `queueMicrotask` deferral) for **both** user and assistant roles. `message_start` no longer attaches `entryId` at all.
- **Update client event-reducer**: consume `entryId` from `message_end` for both roles. For user messages, retroactively attach `entryId` to the already-appended user `ChatMessage` (appended at `message_start`), so the UI bubble keeps its current responsiveness.
- **Update specs** to reflect that user-message entryId correctness is a first-class requirement, not "unchanged existing behavior".

## Capabilities

### New Capabilities
- `fork-entryid-accuracy`: Ensure the `entryId` attached to **any** message (user or assistant) in the dashboard correctly identifies that message's own session tree entry, so "Fork from here" always includes the clicked message in the new session.

### Modified Capabilities
(none)

## Impact

- `packages/extension/src/bridge.ts` — `message_start` enrichment branch removed; `message_end` branch runs for all roles.
- `packages/client/src/lib/event-reducer.ts` — user-message `entryId` now sourced from `message_end` (retroactive attach on the most recent user `ChatMessage`).
- `packages/shared/src/state-replay.ts` — unchanged (replay already uses `entry.id` correctly for both roles).
- `packages/server/src/session-file-reader.ts` — unchanged (bug is in the entryId value, not the pruning).
- No protocol changes. `entryId` field already exists; we're fixing which value gets written to it.
