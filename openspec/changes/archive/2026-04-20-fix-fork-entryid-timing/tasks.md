## 1. Fix entryId enrichment timing in bridge

- [x] 1.1 In `packages/extension/src/bridge.ts`, split the `message_start || message_end` entryId enrichment block into two separate branches: one for `message_start` (immediate `getLeafId()`, unchanged) and one for `message_end` (deferred via `await new Promise(resolve => queueMicrotask(resolve))` before `getLeafId()`)
- [x] 1.2 Add/update the existing session-switch test in `packages/extension/src/__tests__/session-switch.test.ts` (or a new test file) to verify that `message_end` events carry the correct post-persist entryId

## 2. Verify end-to-end fork behavior

- [x] 2.1 Manual test: open dashboard, have a multi-turn conversation, click "Fork from here" on an assistant message, verify the new session includes the clicked assistant message
- [x] 2.2 Manual test: click "Fork from here" on a user message, verify existing behavior is preserved (fork includes that user message)
