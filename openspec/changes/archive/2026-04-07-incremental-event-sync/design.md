## Context

The dashboard has a 3-hop event pipeline: bridge extension → server (in-memory event store with seq numbers) → browser client. The `subscribe` message already supports `lastSeq` and the server's `getEvents(sessionId, minSeq)` already filters correctly. But the client always sends `lastSeq: 0`, and the server always wipes events on bridge reconnect, forcing full replays at every level.

Current reconnect costs:
- **Browser reconnect**: Full replay of ALL events for ALL subscribed sessions (auto-subscribes every active session)
- **Bridge reconnect**: Server wipes event store → `session_state_reset` to browsers → bridge replays full conversation → server re-sends everything to browsers
- **Session select**: Full replay from seq 1 even if client already has events 1–500

## Goals / Non-Goals

**Goals:**
- Browser reconnect fetches only new events (delta from last known seq)
- Bridge reconnect preserves server event store when session hasn't changed
- Only the currently viewed session is subscribed (sidebar uses metadata broadcasts)
- Zero protocol breaking changes — old clients/bridges work unchanged

**Non-Goals:**
- Compressing event payloads (orthogonal optimization)
- Persistent event storage across server restarts (already handled by on-demand disk loading)
- Diffing or patching client-side reducer state (too complex, marginal gain over delta replay)

## Decisions

### D1: Client tracks `maxSeq` per session in a parallel Map

**Choice**: Store `maxSeqMapRef` as a `useRef<Map<string, number>>` alongside `sessionStates`. Updated on every `event` and `event_replay` message. Read imperatively as `lastSeq` on subscribe calls.

**Why useRef, not useState?** `maxSeq` is transport metadata only read during imperative subscribe calls, not during rendering. A ref avoids unnecessary re-renders. Resetting on `session_state_reset` works fine since the handler directly mutates the ref.

**Why not store inside SessionState?** `SessionState` is rebuilt by the reducer from events. `maxSeq` is transport metadata, not domain state. Keeping it separate avoids coupling.

### D2: `session_state_reset` resets `maxSeq` to 0

When the server sends `session_state_reset` (bridge reconnected with full wipe), the client must reset its seq tracker for that session and accept a full replay. This is the fallback path.

### D3: Bridge sends `eventCount` with `session_register` for skip-wipe detection

**Choice**: Add optional `eventCount: number` to `session_register`. Server stores it as `lastEntryCount` on the `DashboardSession` and compares against it on the next reconnect. If they match and events exist in the store, skip the wipe.

**Why compare entry counts, not event store length?** Bridge `eventCount` is the number of pi conversation entries. The event store contains dashboard events synthesized from those entries — different counts. Comparing `eventCount` against `eventCount` (stored from previous registration as `lastEntryCount`) is apples-to-apples.

**Why eventCount, not a hash?** Counting is O(1) on the bridge side (`entries.length`). A hash requires reading all entries and is expensive for large sessions. Count is sufficient because:
- If counts match, events are the same (events are append-only within a session)
- If session switched/forked, the sessionId changes → always triggers wipe
- If session compacted, entry count drops → mismatch → triggers wipe

**Alternatives considered:**
- Hash of last entry: Expensive, requires serialization
- Compare with eventStore.getEvents().length: Wrong — dashboard events ≠ pi entries
- Generation counter stored in bridge: Adds mutable state to track; count is simpler
- Always skip wipe: Unsafe — misses compaction and session file corruption

### D4: Lazy subscription — subscribe only to selected session

**Choice**: On browser connect, do NOT auto-subscribe to active sessions. Only subscribe when the user selects a session (navigates to it). Unsubscribe is not needed — the server already handles WebSocket close cleanup.

**Why this is safe:** Sidebar session cards only display metadata (status, model, currentTool, tokens) which comes from `session_updated` broadcasts — not from events. Events are only needed for the ChatView.

**What about live streaming indicators?** The `session_updated` broadcast already carries `status: "streaming"`, `currentTool`, flow progress, etc. No events needed for the sidebar.

### D5: Re-subscribe on session_state_reset with lastSeq: 0

When the server sends `session_state_reset` for a session the client is subscribed to, the client resets `maxSeq` to 0. The server will follow with `event_replay` containing all events. No explicit re-subscribe needed — the server pushes the replay to existing subscribers.

### D6: Server suppresses live events during replay

When a browser subscribes with `lastSeq > 0` and the server is sending a delta replay, live events arriving during the replay could be received out-of-order (event 101 arrives before replay batch 51–100). The server SHALL suppress live `event` broadcasts to that specific WebSocket until the replay completes (`isLast: true` sent). Events arriving during replay are still stored in the event store — the replay batch will include them if they fall within the range, or the next live broadcast picks them up after replay finishes.

**Why per-WebSocket, not per-session?** Other browser tabs subscribed to the same session that are not replaying should still get live events immediately.

### D7: Sidebar cards do not need SessionState

Confirmed: every piece of data displayed on sidebar `SessionCard` comes from `DashboardSession` metadata, updated via `session_updated` broadcasts. `contextUsageMap` falls back to `session.contextTokens`/`session.contextWindow` when no `SessionState` exists. Lazy subscribe is safe for the sidebar.

## Risks / Trade-offs

**[Risk] Stale seq after server restart** → Server restarts reset seq counters to 1. Client might send `lastSeq: 500` but server only has seq 1–10 (reloaded from disk). Mitigation: Server detects `lastSeq > maxStoredSeq` and sends full replay with a `session_state_reset` first.

**[Risk] Bridge eventCount mismatch false negative** → If pi adds entries between bridge disconnect and reconnect (unlikely but possible with queued messages), count could match by coincidence with different content. Mitigation: Accept this as extremely unlikely; the fallback is a redundant full replay (no data loss, just wasted bandwidth).

**[Risk] Lazy subscribe delays initial chat load** → User clicks a session and has to wait for event replay. Mitigation: Replay is fast for in-memory events (sub-100ms for typical sessions). For disk-loaded sessions, the existing loading indicator already handles this.

**[Risk] Multiple browser tabs** → Each tab tracks its own `maxSeq` independently. This is correct — each WebSocket connection is independent. No shared state issues.
