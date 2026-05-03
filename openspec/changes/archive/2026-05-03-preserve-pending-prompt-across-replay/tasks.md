## 1. Client edits

- [x] 1.1 In `packages/client/src/hooks/useMessageHandler.ts` `case "session_state_reset"`: read `existing = next.get(msg.sessionId)`, build `fresh = createInitialState()`, copy `existing.pendingPrompt` onto `fresh` if set, then `next.set(msg.sessionId, fresh)`.
- [x] 1.2 In `packages/client/src/hooks/useMessageHandler.ts` `case "event_replay"` `shouldReset` branch: capture `carry = next.get(msg.sessionId)?.pendingPrompt` before swapping to `createInitialState()`; after the swap (and before reducing replay events), assign `current.pendingPrompt = carry` if defined.

## 2. Tests

- [x] 2.1 Add unit test under `packages/client/src/__tests__/useMessageHandler-*.test.ts` (or extend existing one): given a state with `pendingPrompt` set, dispatch a `session_state_reset` for that session id; assert `pendingPrompt` survives and other fields equal `createInitialState()` defaults.
- [x] 2.2 Add unit test for `event_replay` `shouldReset` path: given state with `pendingPrompt` set, dispatch `event_replay` with `firstSeq === 1`; assert `pendingPrompt` survives and replayed events are reduced on top of the carried state.
- [x] 2.3 Add a regression assertion that the reducer paths still clear `pendingPrompt` on user `message_start` (sanity — covered by existing `optimistic-prompt` tests; add only if not already pinned).

## 3. Manual verification

- [ ] 3.1 With the dashboard running, end a session (Shutdown), navigate to its chat view, type a prompt, hit Enter. Confirm the optimistic bubble (with spinner) stays visible across the resume → replay → first user_message round trip — never blanks out.
- [ ] 3.2 Verify the safety timeout still fires: simulate a stalled resume (e.g. block bridge connect) and confirm the existing 30 s error path still triggers.
- [ ] 3.3 Verify Stop / Esc cancel still clears `pendingPrompt` for both an active session and an in-flight resume.

## 4. Docs

- [x] 4.1 Add a one-line row to `docs/file-index-client.md` against `packages/client/src/hooks/useMessageHandler.ts` noting the carry-pendingPrompt behavior on reset/replay (caveman style; reference change `preserve-pending-prompt-across-replay`). Delegate the docs write to a general-purpose subagent per AGENTS.md docs protocol.
