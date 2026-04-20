## Why

When a user clicks "Fork from here" on an assistant message in the dashboard, the new session is created **without** that assistant message. This is because pi core emits the `message_end` event to extensions **before** persisting the entry to the session tree via `sessionManager.appendMessage()`. The bridge extension calls `getLeafId()` at event time, capturing the **previous** entry's ID (the user message), not the assistant's own entry. The forked session file is then pruned to that stale leaf, cutting off the message the user intended to fork from.

## What Changes

- **Fix `entryId` enrichment timing in the bridge extension** so that the `entryId` attached to `message_end` events reflects the **assistant's own session entry**, not the prior leaf.
- The fix must work within the constraint that pi core persists entries **after** emitting `message_end` to extensions — the bridge cannot rely on `getLeafId()` at `message_end` time for assistant messages.
- One approach: defer `getLeafId()` capture for `message_end` events (e.g., use `queueMicrotask` or `setTimeout(0)`) so it runs after `appendMessage` completes synchronously in the same event loop tick.
- Alternative approach: capture `entryId` from `turn_end` instead, and retroactively associate it with the last assistant message. This avoids timing hacks but changes the data flow.

## Capabilities

### New Capabilities
- `fork-entryid-accuracy`: Ensure the `entryId` attached to assistant messages in the dashboard correctly identifies the assistant's own session tree entry, so that "fork from message" includes the clicked message in the new session.

### Modified Capabilities

## Impact

- `packages/extension/src/bridge.ts` — the `entryId` enrichment logic for `message_end` events
- Possibly `packages/server/src/session-file-reader.ts` if the pruning logic needs adjustment (unlikely — the bug is in the entryId, not the pruning)
- No API or protocol changes needed — `entryId` field already exists in the protocol, it just carries the wrong value
