## 1. Spec + shared budget helper

- [x] 1.1 Author proposal.md / design.md / specs (this change) and validate with openspec if available
- [x] 1.2 Add pure `selectNewestEventsByBudget` (+ size helper) under `packages/shared` with unit tests: empty, under budget, over budget, always-keep-newest, ascending output order
- [x] 1.3 Export from shared package surface used by client + server

## 2. Protocol types

- [x] 2.1 Extend `SubscribeMessage` with optional `mode`, `windowBytes`, `fromSeq`
- [x] 2.2 Extend `EventReplayMessage` with optional `hasMoreOlder`, `windowMinSeq`, `windowMaxSeq`
- [x] 2.3 Protocol unit tests: new fields optional / round-trip if existing codec tests require it

## 3. Server tail + load-older

- [x] 3.1 Failing tests: `mode:"tail"` returns ≤ budget newest events + `hasMoreOlder`; legacy omit mode = full; `fromSeq` returns older page; delta `lastSeq>0` unchanged
- [x] 3.2 Implement window selection in `subscription-handler.ts` (warm store path + cold disk path after load)
- [x] 3.3 Make 3.1 pass

## 4. Client IDB tail put (session-replay-persistence)

- [x] 4.1 Failing tests: over-budget put trims newest-first and **persists**; get returns tail; schema v2 invalidates v1
- [x] 4.2 Implement trim-on-put + schemaVersion bump; stop delete-on-over-cap
- [x] 4.3 Make 4.1 pass

## 5. Client cold subscribe mode

- [x] 5.1 Failing test: first cold subscribe for large/miss path sends `mode: "tail"` (and `lastSeq` from cache when present)
- [x] 5.2 Wire `App.tsx` `doSubscribe` / rehydrate path
- [x] 5.3 `useMessageHandler` records `windowMinSeq` / `hasMoreOlder` per session for load-older
- [x] 5.4 Make 5.1 pass

## 6. Post-hydrate re-pin (chat-scroll-lock)

- [x] 6.1 Flip / extend `ChatView.scroll-race.test.tsx` hydrate land cases: after wipe→rebuild, pin bottom when stick armed / default cold open
- [x] 6.2 Implement re-pin when `loadingHistory` true→false without user escape
- [x] 6.3 Make 6.1 pass

## 7. Load-older UI + prepend

- [x] 7.1 Failing tests: near-top triggers older request with `fromSeq = windowMinSeq`; prepend does not wipe; scroll anchor stable (unit or component-level)
- [x] 7.2 ChatView top sentinel / threshold + App/handler send path
- [x] 7.3 Make 7.1 pass

## 8. Verify

- [x] 8.1 Focused vitest: shared window helper, replay-cache, subscription-handler, ChatView scroll-race, any new handler tests
- [ ] 8.2 Manual / mobile smoke on large session: cold return wire size ≪ full history; land at bottom; scroll-up loads older without jump
- [ ] 8.3 `openspec validate session-tail-rehydrate` (if CLI present)
- [ ] 8.4 PR against `develop`
