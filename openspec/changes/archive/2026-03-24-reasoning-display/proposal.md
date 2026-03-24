## Why

LLM reasoning/thinking content is already forwarded from pi sessions to the dashboard server via `assistantMessageEvent` thinking events, but the client-side event reducer ignores it completely. Users monitoring sessions remotely have no visibility into the model's reasoning process, which is critical for understanding *why* the agent makes certain decisions.

## What Changes

- Extract thinking content from `assistantMessageEvent` (`thinking_start`, `thinking_delta`, `thinking_end`) in the event reducer
- Stream reasoning text live (like assistant text) with a dedicated `streamingThinking` field
- On thinking block completion, emit a collapsible "Reasoning" message in the chat timeline
- Render reasoning blocks in the ChatView using the same expand/collapse pattern as tool calls (brain icon, collapsed by default)
- Store full reasoning text without truncation

## Capabilities

### New Capabilities
- `reasoning-display`: Display LLM reasoning/thinking content as collapsible blocks in the dashboard chat view, streamed in real-time

### Modified Capabilities
<!-- None - no existing spec-level requirements change. The event forwarding already works. -->

## Impact

- `src/client/lib/event-reducer.ts` — New thinking state tracking and message creation
- `src/client/components/ChatView.tsx` — Render reasoning blocks (collapsible)
- No protocol changes needed — thinking data already flows through `event_forward`
- No server changes needed — events pass through as-is
