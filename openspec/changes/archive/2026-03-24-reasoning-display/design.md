## Context

The dashboard already receives full `message_update` events from pi sessions including `assistantMessageEvent` with `thinking_start`, `thinking_delta`, and `thinking_end` sub-events. The event-forwarder in the bridge extension serializes all fields. The gap is purely client-side: the event reducer only extracts `type === "text"` content blocks, and the ChatView has no rendering for thinking content.

The existing `ToolCallStep` component provides a proven collapsible UI pattern (chevron toggle, status icon, expand/collapse panel) that can be adapted for reasoning blocks.

## Goals / Non-Goals

**Goals:**
- Stream reasoning content in real-time as it arrives via `thinking_delta` events
- Display completed reasoning blocks as collapsible items in the chat timeline
- Store full reasoning text without truncation
- Reuse existing UI patterns (collapsible step style) for consistency

**Non-Goals:**
- Protocol or server changes (data already flows correctly)
- Reasoning content search or filtering
- Reasoning token cost breakdown display
- Persisting reasoning separately from events (it's already in the event stream)

## Decisions

### 1. Extract thinking from `assistantMessageEvent`, not `message.content` blocks

**Rationale:** `assistantMessageEvent` provides `thinking_start`/`thinking_delta`/`thinking_end` which maps naturally to streaming state. The `message.content` blocks only give final text at `message_end`, which would prevent live streaming.

**Alternative:** Parse `message.content` for `type: "thinking"` blocks at `message_end`. Simpler but no live streaming.

### 2. Add `streamingThinking` field to `SessionState`, parallel to `streamingText`

**Rationale:** Same proven pattern already used for assistant text streaming. Accumulate deltas into `streamingThinking`, then on `thinking_end` flush to a message and reset.

**Alternative:** Append thinking directly to messages array during streaming. Would cause excessive re-renders and complicate the "streaming" visual indicator.

### 3. Use a new `"thinking"` role in `ChatMessage` (not reuse `"toolResult"`)

**Rationale:** Clean separation. Tool results have `toolCallId`, `args`, `toolStatus` etc. that don't apply to thinking. A distinct role makes rendering logic straightforward with no special-case hacks.

### 4. Render as collapsible block similar to ToolCallStep, collapsed by default

**Rationale:** Reasoning text can be very long. Collapsed by default keeps the chat clean. Brain icon (🧠) differentiates from tool steps visually.

## Risks / Trade-offs

- **Long reasoning text** → Full storage means large DOM when expanded. Acceptable since it's user-triggered (expand) and most users won't expand every block.
- **Multiple thinking blocks per turn** → Some models emit multiple thinking blocks. Each gets its own collapsible entry. This matches pi TUI behavior.
