# preserve-chat-head-on-event-trim

## Why

Sessions that run a subagent lose the **beginning** of their chat history. The
in-memory event store (`memory-event-store.ts`) caps each session at
`maxEventsPerSession` and, when exceeded, trimmed the **oldest** events with
`buf.events.splice(0, excess)`. A subagent turn forwards every subagent
lifecycle event plus every inner tool-call/result into the **parent** session's
buffer (catch-all `event_forward` from `bridge.ts`), so one subagent-heavy turn
can emit thousands of events and blow the cap — deleting the user's opening
prompts and the assistant's first replies. The client rebuilds chat state from
the replay, so the dropped head visibly disappears.

Two defects compound:

1. **Wrong eviction target** — trimming the oldest events discards the
   conversation head (chat-critical `message_start`/`message_end`) while keeping
   ephemeral tool/subagent noise.
2. **Cap too low for subagents** — the 5000 default is easily exceeded by a
   single subagent run.

A naive fix (scan for the oldest non-essential event and splice it on every
over-cap insert) reintroduces a **performance** regression: `findIndex` +
`splice` are each O(n), run on every insert once at the cap, and the
history-load path inserts every replayed event through the same code in a loop —
turning cold session load into O(events × cap).

## What Changes

- **Preserve the chat transcript head when trimming.** The per-session trim
  drops the **oldest non-essential** event first (tool_execution_*, subagent_*,
  flow_*, reasoning, stats, streaming `message_update` deltas). `message_start`
  and `message_end` — sufficient to rebuild a completed message's text on the
  client — are never dropped unless the transcript *alone* exceeds the cap
  (pathological), in which case the oldest essential is dropped only to hold the
  memory bound.
- **Raise `maxEventsPerSession` default 5000 → 20000** so normal subagent turns
  never trim at all.
- **Amortize the trim cost (hysteresis).** Only reclaim once the buffer
  overshoots the cap by a `TRIM_SLACK` margin (scales 0→256 with the cap), then
  trim back to the cap in a single O(n) pass. Amortized cost is O(1) per insert
  instead of O(n), which also fixes the cold-load path (O(events) instead of
  O(events × cap)).
- No protocol changes. No client changes. Config default only.

## Capabilities

### Modified Capabilities

- `in-memory-event-buffer` — adds a per-session trim requirement that preserves
  the chat transcript head and bounds the buffer with amortized-O(1) reclaim.

## Discipline Skills

- `performance-optimization` — the trim runs on a hot path (every insert, and
  the bulk history-load loop); the hysteresis design is measured against that
  cost.

## Impact

- `packages/server/src/memory-event-store.ts` — essential-aware single-pass
  `trimBufferToLimit`, hysteresis gate, `DEFAULT_MAX_EVENTS_PER_SESSION` 20000.
- `packages/shared/src/config.ts` — `DEFAULT_MEMORY_LIMITS.maxEventsPerSession`
  20000.
- `packages/server/src/__tests__/memory-event-store.test.ts` — new tests:
  chat-head preservation, all-essential fallback, subagent-flood boundedness.
- Live sessions and reopened sessions both use `insertEvent`, so both paths are
  fixed. On-disk JSONL is unaffected — this only governs the in-memory display
  buffer.
