# Add a "closing" indicator while a session card shuts down

## Why

Closing a session card can take several seconds, with **no visual feedback**
during the wait. The user clicks the ✕, nothing changes, and the card sits
visually identical — fully styled, still clickable — until it abruptly
vanishes. Users re-click, assume it's broken, or lose track of which card they
just closed.

Root cause is a missing optimistic pending-state. The close path fires a
fire-and-forget WebSocket message and does **no** local state change:

```ts
// useSessionActions.ts:202
const handleShutdownSession = useCallback((sessionId: string) => {
  send({ type: "shutdown", sessionId });   // ← that's all; card untouched
}, [send]);
```

The card only disappears when `session_removed` arrives, which is gated on the
server's kill ladder:

```
SERVER handleShutdown                       session-action-handler.ts:518
  1. piGateway.sendToSession(shutdown)   → bridge graceful pi exit
  2. await killBySessionId(...)          → SIGTERM ─ wait 2s ─ SIGKILL   ◄ THE WAIT
  3. sessionManager.unregister(...)
  4. broadcast({ session_removed })
```

```
   T+0ms        click ✕
   T+0ms   ───► card looks 100% normal, still clickable, no feedback
                user thinks: "did it register? *click again*"
   T+2-4s       session_removed arrives → card vanishes
```

The dashboard **already has** the right pattern for this. Resume uses a
client-side transient flag — `DashboardSession.resuming?: boolean`
(`types.ts:165`) — set optimistically the instant the action fires, which the
card reads (`getCardPulseClass` → `card-working-pulse`). Shutdown is the odd
one out: it has no equivalent. This change gives shutdown the same treatment.

## What changes

Mirror the existing `resuming` flag with a transient `closing` flag, set
optimistically when the user triggers shutdown and cleared automatically when
`session_removed` removes the card.

```
              resume (today)              shutdown (today)         shutdown (this change)
              ──────────────              ────────────────         ──────────────────────
  on click    resuming = true             send() only              closing = true
  card UI     card-working-pulse          NOTHING — looks normal   dim + spinner + ✕ disabled
  clears on   session state update        session_removed (2-4s)   session_removed (2-4s)
```

- Add `closing?: boolean` to `DashboardSession` (client-side transient,
  alongside `resuming?`). Bridges and server SHALL NOT send it.
- `handleShutdownSession` sets `closing = true` via `setSessions` before
  `send()`, mirroring `handleResumeSession`.
- `SessionCard` renders a closing state when `closing` is true: dim the card,
  swap the ✕ for a spinner, and disable re-clicks on the close control.
- Clearing is automatic — the existing `session_removed` broadcast removes the
  card. No extra wiring.
- **Safety revert**: if `session_removed` never arrives, clear `closing` after
  a bounded timeout (default 10s) so the card can never spin forever and the
  user can retry.

No server, bridge, or protocol changes. The 2s SIGTERM→SIGKILL ladder is
unchanged; it simply becomes visible-as-progress instead of dead air.

## Impact

- New capability: `session-card-closing-indicator`.
- Affected code:
  - `packages/shared/src/types.ts` — add `closing?: boolean`.
  - `packages/client/src/hooks/useSessionActions.ts` — optimistic flip +
    safety-revert timer in `handleShutdownSession`.
  - `packages/client/src/components/SessionCard.tsx` — closing visual state
    (dim, spinner, disabled ✕).
- No behavior change on resume, abort, or any non-shutdown action.
- Honest by construction: the card stays until the real `session_removed`, so a
  failed/slow kill cannot make the UI lie.
