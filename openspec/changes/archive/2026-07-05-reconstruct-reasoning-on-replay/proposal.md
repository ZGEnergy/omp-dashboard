# reconstruct-reasoning-on-replay

## Why

Reopened / cold-loaded sessions show **no reasoning entries** for historical
turns, even though every turn had visible reasoning while live.

Root cause: reasoning (`role:"thinking"`) rows are created **only** from the
live streaming events `thinking_start` / `thinking_delta` / `thinking_end`
(handled in the `message_update` branch of `event-reducer.ts`). The cold-load
path (`state-replay.ts`) reconstructs a session from the persisted JSONL and
emits only `message_update {message}` and `message_end {message}` — it emits
**no** `thinking_*` events. The `message_end` handler materializes the assistant
**text** row from `msg.content` but never builds a `thinking` row from the
`{ type: "thinking", thinking: "…" }` content blocks. `reorderToolCards…` only
reorders existing thinking rows, so the reasoning is silently dropped on every
replayed turn.

The reasoning text is NOT lazy-loaded by id and needs no server round-trip: it
is persisted **inline** in the session file (verified: assistant content blocks
carry `"type":"thinking","thinking":"…full text…"`) and already arrives on the
wire inside `message_end`'s `msg.content`. The client reducer simply fails to
render it. This is a pre-existing gap, independent of the event-trim work.

## What Changes

- In the `message_end` handler, when `msg.content` contains `thinking` blocks,
  reconstruct `role:"thinking"` rows from them, positioned before the assistant
  text row (tool-bearing messages are re-ordered by the existing content-order
  reorder pass).
- Guard the reconstruction to the **replay path** (`!isLive`) so the live path,
  which already builds thinking rows from `thinking_end`, does not
  double-create.
- Read the block text from `thinking` (persisted key), falling back to `text`.
- Client-only. No protocol, server, config, or persistence changes.

## Capabilities

### Modified Capabilities

- `event-reducer` — adds reasoning-row reconstruction from finalized message
  content on the replay path.

## Discipline Skills

- None. Pure client reducer fix with unit-test coverage; no auth, perf budget,
  external call, or migration.

## Impact

- `packages/client/src/lib/event-reducer.ts` — `message_end` reconstructs
  `thinking` rows from `msg.content` when `!isLive`.
- `packages/client/src/lib/__tests__/event-reducer.test.ts` — new tests: replay
  rebuilds a thinking row (before text), multiple thinking blocks in order, and
  the live path does not double-create.
- User-visible: reopened sessions now show reasoning for historical turns,
  matching the live view.
