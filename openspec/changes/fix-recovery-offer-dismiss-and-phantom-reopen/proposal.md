## Why

The cold-start "reopen sessions after shutdown" recovery offer is faulty in `ask` mode. Dismissing the offer (clicking ×) does not stick: the server keeps the pending offer for the whole process lifetime and replays it on every WebSocket reconnect, so the popup keeps coming back. Separately, interrupted candidate sessions are exempted from cold-start `ended`-normalization, so they linger in the session list looking already-reopened before the user ever clicks Reopen. Reopening a pi session `continue`s a real agent that spends tokens and may re-run tool calls, so a false or forced reopen has a real cost.

## What Changes

- Dismiss (×) becomes durable and Chrome-faithful: it CONSUMES the on-disk liveness marker for the offered sessions (so a full server restart never re-offers them) and clears the server-held pending offer (so no reconnect replays it). Introduce a client→server `recovery_dismiss` protocol message.
- `ask` mode no longer exempts candidates from `ended`-normalization. Interrupted candidates are normalized to `ended` on cold start exactly like `off` mode, so nothing looks pre-reopened. The offer carries enough metadata (sessionFile, cwd) to resume on explicit click; reopen happens ONLY on the Reopen button.
- The offer shows once: after any resolving action (reopen or dismiss) the server-held `pendingRecoveryOffer` is cleared, so `onConnect` replay stops.
- `auto` and `off` modes are unchanged in intent — `auto` silently resumes with NO notification, `off` normalizes with no prompt. The three-mode setting stays; `auto` is confirmed as the notification-free path.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `shutdown-session-recovery`: dismissal SHALL consume the liveness marker and never re-offer; `ask`-mode candidates SHALL be normalized to `ended` on cold start (reopen only on explicit action); the offer SHALL NOT replay after a resolving action.

## Impact

- `packages/server/src/server.ts` — drop `ask`-mode normalization exemption (lines ~298-306); clear `pendingRecoveryOffer` on resolving actions; handle inbound `recovery_dismiss`.
- `packages/server/src/meta-persistence.ts` — liveness-marker clear on dismiss (`setLiveness(file, {live:false})`).
- `packages/shared/src/browser-protocol.ts` — new `recovery_dismiss` message type (client→server).
- `packages/client/src/lib/recovery-offer-bus.ts` + `RecoveryOfferHost.tsx` — dismiss sends `recovery_dismiss` to server, not just local clear.
- `packages/client/src/hooks/useMessageHandler.ts` / `App.tsx` — wire the dismiss send.
- Tests: `packages/server/src/__tests__/recovery-*.test.ts`, `packages/client/src/components/__tests__/RecoveryOfferHost.test.tsx`.
- No change to the `auto` / `off` behavior contract; no new setting or migration.
