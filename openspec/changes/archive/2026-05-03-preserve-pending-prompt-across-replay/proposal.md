## Why

When the user types into an ended session's chat input, `auto-resume-on-prompt` correctly queues the prompt and spawns pi in continue mode (same session id). But the bridge's `session_register` triggers `session_state_reset` (whenever `lastEntryCount` is stale or memory-evicted events have aged out), and the client's reset handler calls `createInitialState()` — which discards the optimistic `pendingPrompt` set moments earlier. The user sees their message vanish and stares at an unchanged historical chat for 1–3 s until pi finally emits the `user_message` event back. From their seat the dashboard looks broken: "I sent it, nothing happened, I don't even see what I typed."

The optimistic `pendingPrompt` is purely client-side UI state. The only events with the right semantics to clear it are `message_start` (user), `agent_start`, the safety timeout, or the user's explicit cancel — all already implemented by `optimistic-prompt`. Replay/reset paths have no business touching it.

## What Changes

- Modify `optimistic-prompt`: `pendingPrompt` SHALL survive `session_state_reset` and full-replay branches of `event_replay`. Only the existing reducer-confirmation, timeout, and cancel paths clear it.
- Update `useMessageHandler.ts`:
  - `case "session_state_reset"` carries `pendingPrompt` across the `createInitialState()` swap.
  - `case "event_replay"` `shouldReset` branch carries `pendingPrompt` across the `createInitialState()` swap.
- No protocol change. No server change. No new state.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `optimistic-prompt`: add requirement that `pendingPrompt` is preserved across replay/reset client-side.

## Impact

- Code: `packages/client/src/hooks/useMessageHandler.ts` (two cases). Possibly a small unit test under `packages/client/src/__tests__/`.
- No server, bridge, protocol, or persistence change.
- Risk: extremely low — `pendingPrompt` is already cleared by user_message arrival, the 30 s safety timeout in `App.tsx`, and the explicit Stop/Esc cancel paths. The change only removes two unintended clear sites; all intended clear sites remain.
- Visible behavior: the optimistic user-message bubble (with spinner) stays on screen during the resume → replay → first-user_message round trip, instead of disappearing for 1–3 s.
