## 1. Event Reducer — Thinking State

- [x] 1.1 Add `streamingThinking` field to `SessionState` interface and `createInitialState()`
- [x] 1.2 Add `"thinking"` to `ChatMessage.role` union type
- [x] 1.3 Handle `thinking_start` in `reduceEvent` — reset `streamingThinking` to empty string
- [x] 1.4 Handle `thinking_delta` in `reduceEvent` — append delta to `streamingThinking`
- [x] 1.5 Handle `thinking_end` in `reduceEvent` — create thinking message from accumulated text and reset `streamingThinking`
- [x] 1.6 Skip creating thinking message when `streamingThinking` is empty at `thinking_end`
- [x] 1.7 Write tests for thinking event reduction (start/delta/end flow, empty block, multiple blocks)

## 2. ChatView — Rendering

- [x] 2.1 Create `ThinkingBlock` component — collapsible block with brain icon, "Reasoning" label, collapsed by default
- [x] 2.2 Render `role: "thinking"` messages using `ThinkingBlock` in ChatView
- [x] 2.3 Render live `streamingThinking` as an expanded thinking block with streaming indicator
- [x] 2.4 Verify full reasoning text displays without truncation when expanded
