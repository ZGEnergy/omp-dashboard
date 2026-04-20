## Context

Pi core's `_processAgentEvent` in `agent-session.js` processes events in this order:

```
async _processAgentEvent(event) {
    await this._emitExtensionEvent(event);     // 1. Extension handlers (NOT bridge)
    this._emit(event);                          // 2. Event listeners (bridge IS here)
    if (event.type === "message_end") {
        sessionManager.appendMessage(event.message);  // 3. Persist → updates leafId
    }
}
```

The bridge extension registers via `pi.on("message_end", handler)` which hooks into `_emit` (step 2). `_emit` is synchronous and does NOT await async handlers — it just calls them and moves on. The bridge handler runs synchronously up to its first `await`, calling `getLeafId()` which returns the **previous** leaf because `appendMessage` (step 3) hasn't run yet.

Result: assistant messages carry the wrong `entryId` (pointing to the preceding user entry), so "fork from message" excludes the clicked message.

**Key constraint**: We cannot change pi core. The fix must be in the bridge extension only.

## Goals / Non-Goals

**Goals:**
- The `entryId` on `message_end` events for assistant messages must reflect the assistant's own session tree entry
- "Fork from here" on any message includes that message in the new session
- No changes to pi core (`@mariozechner/pi-coding-agent`)

**Non-Goals:**
- Changing the session file format or fork pruning logic (those work correctly given the right entryId)
- Fixing `message_start` entryId (it correctly reflects the leaf at user-message time, which is fine for fork — forking from a user message should include up to that user message's entry)

## Decisions

### Defer `getLeafId()` for `message_end` using microtask

Since `_emit` does not `await` the bridge's async handler, inserting an `await` before `getLeafId()` will yield control back to `_processAgentEvent`, which then runs `appendMessage` synchronously (updating `leafId`). When the microtask resolves, the bridge resumes and `getLeafId()` returns the correct value.

```typescript
// For message_end, defer getLeafId() to after pi core persists the entry
if (eventType === "message_end") {
    await new Promise<void>(resolve => queueMicrotask(resolve));
    const entryId = ctx.sessionManager?.getLeafId?.();
    if (entryId) {
        const enriched = { ...event, entryId };
        const msg = mapEventToProtocol(sessionId, enriched);
        connection.send(msg);
        return;
    }
}

// For message_start, capture immediately (current behavior is correct)
if (eventType === "message_start") {
    const entryId = ctx.sessionManager?.getLeafId?.();
    if (entryId) {
        const enriched = { ...event, entryId };
        const msg = mapEventToProtocol(sessionId, enriched);
        connection.send(msg);
        return;
    }
}
```

**Why this works**: `_emit` calls the async handler, which starts synchronously. When the handler hits `await queueMicrotask(...)`, it yields. `_emit` returns. `appendMessage` runs synchronously (updating `this.leafId`). The microtask resolves, the handler resumes, and `getLeafId()` now returns the assistant's own entry ID.

**Alternative considered**: Using `setTimeout(0)` — this defers to the macrotask queue which is overkill and adds unnecessary latency. `queueMicrotask` runs at the end of the current microtask queue, which is after all synchronous code in `_processAgentEvent` completes but before any I/O callbacks.

**Alternative considered**: Capturing entryId from `turn_end` and retroactively updating — this is more complex, requires buffering messages and matching them, and changes the data flow significantly.

## Risks / Trade-offs

- **[Risk] Future pi core changes reorder appendMessage before _emit** → The microtask deferral would then capture the same value as immediate capture. No harm, just unnecessary. Low risk.
- **[Risk] Other events interleave during microtask yield** → `appendMessage` is synchronous and runs immediately after `_emit`. No other events can fire between `_emit` return and `appendMessage` because they're in the same synchronous block. The only thing that could update `leafId` further is if `appendMessage` is called multiple times, but `message_end` fires once per message. Low risk.
- **[Risk] `message_end` for user messages also deferred** → The fix must only defer for `message_end`, not `message_start`. For `message_start` the current behavior is correct (captures leaf before user entry is written). We split the `if` into separate branches.
- **[Trade-off] Slight delay in dashboard receiving message_end** → One microtask tick (~microseconds). Imperceptible to users.
