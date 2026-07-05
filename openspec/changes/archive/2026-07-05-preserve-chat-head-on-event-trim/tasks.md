# Tasks

## 1. Preserve chat head on trim
- [x] 1.1 Add `ESSENTIAL_CHAT_EVENT_TYPES` = { `message_start`, `message_end` }.
- [x] 1.2 Add single-pass `trimBufferToLimit(buf, cap)` that drops oldest
      non-essential first, falls back to oldest essential only when essentials
      alone exceed the cap.
- [x] 1.3 Replace `splice(0, excess)` in `insertEvent` with the essential-aware
      trim. → verify: unit test asserts `message_start`/`message_end` survive a
      flood while oldest tool/subagent events are dropped.

## 2. Raise the cap
- [x] 2.1 `DEFAULT_MAX_EVENTS_PER_SESSION` 5000 → 20000 (memory-event-store.ts).
- [x] 2.2 `DEFAULT_MEMORY_LIMITS.maxEventsPerSession` 5000 → 20000 (config.ts).

## 3. Amortize trim cost (hysteresis)
- [x] 3.1 Add `trimSlack = min(256, floor(cap * 0.05))`; gate the reclaim on
      `length > cap + trimSlack`. → verify: buffer stays ≤ cap + slack under a
      10k-event flood; opening chat events remain at seq 1/2.

## 4. Verify
- [x] 4.1 `npm test` for memory-event-store, subscription-handler, config.
- [ ] 4.2 Manual: run a subagent-heavy session live, confirm the opening
      prompts remain visible after the subagent completes.
