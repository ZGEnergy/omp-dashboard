## 1. Bridge: symmetrize entryId capture

- [x] 1.1 Split `message_start || message_end` block: `message_start` immediate `getLeafId()`, `message_end` deferred via `queueMicrotask` (prior fix — assistant side)
- [x] 1.2 Test that `message_end` carries post-persist entryId for assistant messages (prior fix)
- [ ] 1.3 Remove the `message_start` entryId enrichment branch entirely in `packages/extension/src/bridge.ts` — `message_start` events forwarded without `entryId`
- [ ] 1.4 Confirm the `message_end` branch in `packages/extension/src/bridge.ts` has no role guard — runs for `user` and `assistant` messages alike via the single `queueMicrotask → getLeafId()` path
- [ ] 1.5 Add a bridge test in `packages/extension/src/__tests__/fork-entryid-timing.test.ts` asserting that `message_end` for a **user** message carries the post-`appendMessage` entryId (parallel to the existing assistant test)
- [ ] 1.6 Add a bridge test asserting `message_start` events (both roles) are forwarded without an `entryId` field

## 2. Client reducer: retroactive entryId attach for users

- [ ] 2.1 In `packages/client/src/lib/event-reducer.ts` `message_start` case: remove `entryId: data.entryId as string | undefined` from the user `ChatMessage` append
- [ ] 2.2 In `packages/client/src/lib/event-reducer.ts` `message_end` case: add a user-role branch that finds the last `ChatMessage` with `role === "user"` and updates it in-place (immutably) with `entryId = data.entryId`
- [ ] 2.3 Keep assistant handling in `message_end` unchanged
- [ ] 2.4 Add a reducer test: feed `message_start(user)` + `message_end(user, entryId: "u1")` → assert the resulting user `ChatMessage` has `entryId === "u1"`
- [ ] 2.5 Add a reducer test: feed `message_start(user)` alone (no message_end yet) → assert the user `ChatMessage` has `entryId === undefined`
- [ ] 2.6 Regression test: `message_start(assistant)` + streaming + `message_end(assistant, entryId: "a1")` → assert assistant `ChatMessage` has `entryId === "a1"`

## 3. Replay compatibility

- [ ] 3.1 Audit `packages/shared/src/state-replay.ts` — confirm it emits `entryId` on `message_end` for both roles (it already does; no change expected)
- [ ] 3.2 Add a replay test: synthesize events from a two-turn session tree → assert every user and assistant `ChatMessage` in the resulting state has the correct `entryId` matching the source entry id

## 4. End-to-end fork verification

- [ ] 4.1 Manual: open dashboard, conduct a 3-turn conversation, click "Fork from here" on the **user message of turn 2** → new session ends at that user message, and contains it
- [ ] 4.2 Manual: click "Fork from here" on the **very first user message** → new session contains exactly that user message (and any pre-user entries like model_change); no "Entry ID not found" error
- [ ] 4.3 Manual: click "Fork from here" on an assistant message (regression check) → new session contains that assistant message
- [ ] 4.4 Manual: reload the dashboard page after streaming a conversation, then fork from a user message → result matches the pre-reload fork result (determinism check)
- [ ] 4.5 Inspect the resulting forked session `.jsonl` file on disk: its leaf entry's id matches the entryId that was on the clicked bubble

## 5. Documentation

- [ ] 5.1 Update `docs/architecture.md` section on fork behavior to describe the symmetric `message_end`-only entryId flow
- [ ] 5.2 Update the "Key Files" note in `AGENTS.md` for `bridge.ts` and `event-reducer.ts` if needed to reflect the new entryId ownership
