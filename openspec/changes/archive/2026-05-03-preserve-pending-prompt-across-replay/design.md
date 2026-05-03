## Context

`pendingPrompt` is a client-only optimistic UI bubble (set in `useSessionActions.handleSend`, rendered by `ChatView`). Three legitimate clear paths already exist:

1. Reducer event handlers in `event-reducer.ts` (lines 653, 662, 678, 1098, 1116) — `message_start` user / `agent_start` / similar.
2. 30 s safety timeout in `App.tsx` (`usePendingPromptTimeout`).
3. User-driven cancel via Stop button or Escape (in `useSessionActions` line 47-48).

`useMessageHandler.ts` has two additional paths that *unintentionally* clear `pendingPrompt` by replacing the entire `SessionState` with `createInitialState()`:

- `case "session_state_reset"` (line 123-130).
- `case "event_replay"` `shouldReset` branch (line 230).

The `auto-resume-on-prompt` path triggers a bridge `session_register`, which the server commonly answers with `session_state_reset` + replay (whenever `lastEntryCount` was lost across server restart or memory-evicted events have aged out — both common). Net effect: optimistic bubble vanishes for 1–3 s.

## Goals / Non-Goals

**Goals:**
- Keep `pendingPrompt` visible from the moment the user hits Enter until pi confirms the round trip (or the user cancels, or the safety timeout fires).
- Zero protocol or server change.

**Non-Goals:**
- Fixing `lastEntryCount` persistence / event-store eviction so `canSkipWipe` succeeds more often. That's a separate, larger optimization (`auto-resume-on-prompt` ergonomics) — orthogonal to this fix.
- Migrating other ephemeral UI state across reset (e.g., draft text, staged images already live elsewhere and aren't affected by this bug).
- Changing reducer-side clear semantics. Those paths are correct and stay.

## Decisions

### D1 — Carry `pendingPrompt` across reset, instead of moving it server-side

Two options were considered:

| Option | Pros | Cons |
|---|---|---|
| **A. Carry client-side (chosen)** | Pure client patch (2 small edits). Zero protocol risk. Honors the existing semantic that `pendingPrompt` is optimistic UI state. | Relies on reducer/timeout/cancel paths to eventually clear it (they already do). |
| B. Server stores pending prompt + re-broadcasts as a UI hint after replay | Survives client reload mid-resume. | New protocol surface. Server now mirrors UI state. Out of proportion for the bug. |

Going with A.

### D2 — Carry only `pendingPrompt`, not other state

`createInitialState()` resets a lot of fields (messages, streamingText, currentTool, …). Those resets are the *purpose* of `session_state_reset` — they let replay rebuild the chat cleanly. The only field that's wrong to drop is `pendingPrompt`, because it represents user intent that hasn't round-tripped yet. Don't expand the carry-over set; surgical fix only.

### D3 — Apply the carry in both reset sites

`session_state_reset` and `event_replay` (shouldReset branch) are independent code paths. The server can fire either one (or both, in sequence) on a bridge re-register. Both must carry `pendingPrompt` for the fix to be reliable.

## Risks / Trade-offs

- **[Risk] `pendingPrompt` could now outlive scenarios where the original prompt was actually dropped** → Mitigation: the 30 s safety timeout in `App.tsx` already covers this. If pi never confirms, the user gets the existing error toast.
- **[Risk] If the same session id resumes with a *different* pending prompt context (e.g., user typed once, server queued, user navigated and typed again)** → Out of scope: input is disabled while `pendingPrompt` is set (per `optimistic-prompt` requirement), so a second prompt can't be entered into the same session before the first clears.
- **[Trade-off] We're now relying on the existing clear paths to be exhaustive** → They are: reducer covers all confirmation events; `App.tsx` covers stalled prompts; `useSessionActions` covers user cancel. No new clear path needed.

## Migration Plan

- Pure client change. Ships in next dashboard release. No data migration. No flag.
- Rollback: revert the two `useMessageHandler.ts` edits.
