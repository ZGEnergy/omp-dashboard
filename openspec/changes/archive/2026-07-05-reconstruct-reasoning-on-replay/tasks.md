# Tasks

## 1. Reconstruct reasoning rows on replay
- [x] 1.1 In `message_end`, when `!isLive` and `msg.content` has `thinking`
      blocks, push `role:"thinking"` rows built from each block's `thinking`
      (fallback `text`), before the assistant text row.
- [x] 1.2 Skip empty thinking blocks; set `streamedLive: false`.
- [x] 1.3 Rely on the existing content-order reorder pass to position rows
      correctly for tool-bearing messages.

## 2. Guard the live path
- [x] 2.1 Guard reconstruction with `!isLive` so `thinking_end`-created rows are
      not duplicated. → verify: live sequence (thinking_end + message_end with
      the same thinking block) yields exactly one thinking row.

## 3. Verify
- [x] 3.1 Reducer unit tests: replay rebuild (order), multiple blocks, live
      no-double. → `npm test` event-reducer green (172 pass).
- [ ] 3.2 Manual: reopen an old session that had reasoning; confirm the
      reasoning blocks render for historical turns.
