## Context

Pi core's `_processAgentEvent` in `agent-session.js` processes events in this order:

```
async _processAgentEvent(event) {
    await this._emitExtensionEvent(event);     // 1. Extension handlers (NOT bridge)
    this._emit(event);                          // 2. Event listeners (bridge IS here, sync fire-and-forget)
    if (event.type === "message_end") {
        // Runs for BOTH user and assistant roles
        sessionManager.appendMessage(event.message);  // 3. Persist → updates leafId
    }
}
```

Key facts:
- `appendMessage` runs **only on `message_end`**, for both user and assistant messages.
- `_emit` is synchronous and does NOT await async listeners.
- The bridge registers via `pi.on("message_end", handler)` which hooks into step 2.

### Why the previous fix was incomplete

A prior change deferred `getLeafId()` capture via `queueMicrotask` for `message_end` — correct for assistant messages. But user messages were still enriched at `message_start` time, where no `appendMessage` has yet run (for the user or for the preceding assistant, if message_start for assistant is what sets it). The captured leaf is stale: it's the **previous turn's terminal entry**, not the user's own entry.

Symptom: clicking "Fork from here" on a user bubble produces a new session that ends at the preceding assistant message. The clicked user message is missing. For the first user message in a session, `leafId` is null → fork either fails or falls back to the file's trailing entry.

The client `event-reducer` reads entryId asymmetrically (`message_start` for user, `message_end` for assistant), which mirrors the bridge's asymmetry.

**Key constraint**: We cannot change pi core. The fix must live in the bridge extension and dashboard client.

## Goals / Non-Goals

**Goals:**
- Every message bubble in the dashboard carries an `entryId` equal to that message's own session tree entry id.
- "Fork from here" on any bubble (user or assistant, any turn) includes that bubble's message in the new session.
- No changes to pi core (`@mariozechner/pi-coding-agent`).
- No changes to replay semantics (`state-replay.ts` already uses `entry.id` correctly).

**Non-Goals:**
- Changing the session file format or fork pruning logic.
- Replacing the dashboard's `createBranchedSessionFile` reimplementation with pi's native `sessionManager.createBranchedSession()` (tracked separately — current reimplementation is functionally adequate once `entryId` is correct).

## Decisions

### Decision 1 — Move all entryId capture to `message_end`, for both roles

Remove the `message_start` entryId enrichment branch from the bridge. The `message_end` branch (already deferred via `queueMicrotask`) becomes the single source of truth for entryId, applying uniformly to user and assistant messages.

```typescript
// Removed:
// if (eventType === "message_start") { ... getLeafId() ... }

// Retained, now covers all roles:
if (eventType === "message_end") {
    await new Promise<void>(resolve => queueMicrotask(resolve));
    const entryId = ctx.sessionManager?.getLeafId?.();
    if (entryId) {
        const enriched = { ...event, entryId };
        connection.send(mapEventToProtocol(sessionId, enriched));
        return;
    }
}
```

**Why this works for user messages**: `_emit(message_end)` runs the bridge listener, which awaits the microtask. `_emit` returns. `appendMessage(user_msg)` runs synchronously, advancing `leafId` to the user entry's id. Microtask drains, bridge resumes, `getLeafId()` returns the user entry's id.

**Why the design previously claimed `message_start` was correct** — that claim was wrong. It conflated "leaf at message_start time" with "entry id of the upcoming user message". Since `appendMessage` doesn't run at `message_start`, the captured leaf is always one step behind. This design doc supersedes that prior claim.

### Decision 2 — Client reducer: retroactive entryId attach on user `message_end`

The `ChatMessage` for a user message is appended to `state.messages` when `message_start(user)` fires (so the bubble appears immediately in the UI). The `entryId` is no longer available at that point. Two options were considered:

- **Option A (chosen)**: Append on `message_start` as today (no entryId), then on `message_end(user)` find the most recently appended user `ChatMessage` and attach the `entryId` retroactively. Preserves current UI responsiveness.
- **Option B**: Stop appending on `message_start`; append only on `message_end`. Cleaner but delays the bubble by one network round-trip (message_start → message_end) — imperceptible in practice but a behavioral change.

We take A because it localizes the change (one extra line in the `message_end` case, no change to `message_start`) and avoids any UI timing shift.

```typescript
case "message_end": {
  const msg = data.message as any;
  if (msg?.role === "user" && data.entryId) {
    // Retroactively attach entryId to the last user message
    const lastUserIdx = findLastIndex(next.messages, m => m.role === "user");
    if (lastUserIdx >= 0) {
      next.messages = [...next.messages];
      next.messages[lastUserIdx] = { ...next.messages[lastUserIdx], entryId: data.entryId };
    }
    break;
  }
  if (msg?.role === "assistant") { /* unchanged */ }
}
```

### Decision 3 — `message_start(user)` no longer sets entryId

Remove the `entryId: data.entryId` field from the user-message append in the `message_start` case. It was always wrong; keeping it as a fallback would mask regressions.

## Risks / Trade-offs

- **[Risk] `queueMicrotask` ordering assumption breaks** — If a future pi release changes `_processAgentEvent` to run `appendMessage` asynchronously or before `_emit`, the microtask deferral would capture the wrong leaf again. Mitigation: the bridge tests assert the post-`appendMessage` entryId; CI will catch regressions on pi upgrades.
- **[Risk] Multiple user messages in quick succession** — The retroactive attach finds *the most recent* user `ChatMessage`. If two user `message_start` events fire before either `message_end`, the later `message_end` would attach to the correct (last) one, but the earlier would never get its entryId. In practice pi serializes turns through `_agentEventQueue`, so `message_start → message_end` for a user always pairs before the next user event. Low risk.
- **[Risk] Replay path diverges** — `state-replay.ts` synthesizes `message_start` with `entryId` for user messages. If we unconditionally drop `message_start` entryId in the reducer, replay loses it. Mitigation: the reducer change only affects the live path — we keep reading `message_start` entryId as a fallback (or better: replay emits both `message_start` and `message_end` with entryId, and the reducer consumes from `message_end`).
- **[Trade-off] Extra microtask delay for user message_end** — Was already paid for assistant. Adds the same ~microsecond delay for user events. Imperceptible.
- **[Trade-off] entryId momentarily absent on user bubble** — Between `message_start` and `message_end` (milliseconds), the fork icon on a user bubble would be disabled. Acceptable and consistent with how assistant bubbles behave during streaming.
