## Context

The chat view displays session events streamed via WebSocket. Events are received after sending a `subscribe` message with `lastSeq: 0` (full replay) or a higher sequence number (incremental). Currently, there is no way to re-fetch events for a session without reloading the entire page.

Key components:
- `App.tsx` maintains `sessionStates` (Map<string, SessionState>) and `subscribedRef` (Set<string>) tracking which sessions have been subscribed.
- `SessionHeader.tsx` renders session-level action buttons (rename, attach, flow, diff).
- `ChatView.tsx` renders the event-sourced `SessionState`.

## Goals / Non-Goals

**Goals:**
- Add a refresh button to `SessionHeader` that clears local state for the current session and re-subscribes to get a full event replay.
- Show a brief spinning indicator while the replay is in progress.

**Non-Goals:**
- Auto-refresh or periodic polling.
- Refreshing multiple sessions at once.
- Server-side changes — this is purely a client-side re-subscribe.

## Decisions

### 1. Refresh mechanism: clear state + re-subscribe

The refresh callback will:
1. Reset the session's `SessionState` to `createInitialState()` in the `sessionStates` map.
2. Remove the session ID from `subscribedRef` so the existing lazy-subscribe effect re-triggers, OR directly send `{ type: "subscribe", sessionId, lastSeq: 0 }`.

**Chosen approach**: Directly send the subscribe message and clear state in one callback. This is simpler than relying on effect re-triggers and gives immediate feedback.

### 2. Button placement: after the duration badge (desktop), in MobileActionMenu (mobile)

On desktop, a small icon button after the duration text keeps it visible but unobtrusive. On mobile, add it to the `MobileActionMenu` kebab menu to avoid crowding the compact header.

### 3. Loading state: spin the refresh icon

Track a `refreshing` boolean in `SessionHeader`. Set it `true` on click, clear it after a short delay (e.g., 500ms) or when replay events arrive. A simple timeout is sufficient since replay is fast for most sessions.

## Risks / Trade-offs

- [Large session replay could be slow] → Acceptable since this is user-initiated and the same as initial load.
- [Timeout-based loading indicator is imprecise] → Good enough; event_replay completion tracking would add complexity for minimal benefit.
