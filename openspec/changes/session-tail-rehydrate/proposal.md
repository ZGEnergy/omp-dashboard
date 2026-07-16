## Why

Strategy A (`reduce-session-replay-traffic`) persists the full raw event buffer
per session in IndexedDB and delta-subscribes with `lastSeq = maxSeq` on reload.
That fails for the sessions that matter most: **large chats**.

The client cache is all-or-nothing:

- `DEFAULT_MAX_BYTES_PER_SESSION = 5 MiB`
- Over-cap → **delete entry and skip persist** → next cold open is always
  `lastSeq: 0` full replay

The server subscribe path still ships the **entire** in-memory (or cold-loaded
JSONL) event stream when `lastSeq` is 0 (`MAX_REPLAY_EVENTS = 0`). Mobile return
to a conversation therefore re-downloads and re-reduces most/all of history.

A second, related UX bug: after wipe→rebuild of the same `sessionId`, ChatView
restores scroll only on `sessionId` change. Multi-batch hydrate + sticky-scroll
escape leaves the viewport mid-transcript on an arbitrary finished agent bubble
instead of the true bottom / last-seen region.

## What Changes

1. **Byte-budget tail cache (client).** Persist only the **newest** events that
   fit a ~4 MiB budget. Large sessions stay cacheable; cold open rehydrates a
   tail and delta-subscribes from that `maxSeq`. Never all-or-nothing drop solely
   because the full buffer is large.
2. **Server tail-first subscribe (protocol additive).** Cold open uses
   `subscribe { mode: "tail", windowBytes? }`. Server returns the newest events
   under the budget with `hasMoreOlder` / `windowMinSeq` / `windowMaxSeq` on
   `event_replay`. Legacy clients omit `mode` → full replay (unchanged).
3. **Load-older.** When the user reaches the top of the window, request the next
   older page via `fromSeq` (exclusive upper bound). Prepend without wiping;
   preserve scroll anchor.
4. **Post-hydrate re-pin.** When `loadingHistory` clears and the user has not
   deliberately locked away from bottom, pin to the true bottom once so cold
   open lands on the latest content.

## Capabilities

### New Capabilities

- `session-history-window` — tail-mode subscribe, byte-budget event selection,
  `hasMoreOlder` signaling, load-older paging.

### Modified Capabilities

- `session-replay-persistence` — over-cap behavior becomes **trim-to-tail and
  persist**, not delete-and-miss; schemaVersion bump.
- `chat-scroll-lock` — re-pin bottom after history hydrate completes (same
  sessionId), without fighting deliberate scroll-up.

## Non-Goals

- Durable last-seen message id / scroll map across reloads (follow-up).
- Content-aware virtual row size estimates (`fix-chat-scroll-to-top-estimate-drift`).
- Persisting reduced `ChatMessage[]` instead of raw events.
- Prefetch of non-selected sessions.
- Raising server `DEFAULT_MAX_EVENTS_PER_SESSION` as a substitute for windowing.
- Push / unread / `session_view` changes.

## Impact

- `packages/shared/src/browser-protocol.ts` — additive fields on `subscribe` and
  `event_replay`.
- `packages/server/src/browser-handlers/subscription-handler.ts` — tail / older
  page selection before `sendEventBatches`.
- `packages/server/src/` (+ optional shared) — pure
  `selectNewestEventsByBudget`.
- `packages/client/src/lib/replay-cache.ts` / `replay-persist.ts` — tail put,
  schema v2.
- `packages/client/src/App.tsx` — cold subscribe `mode: "tail"`.
- `packages/client/src/components/ChatView.tsx` — re-pin + load-older trigger /
  scroll-anchor preserve.
- `packages/client/src/hooks/useMessageHandler.ts` — handle window metadata;
  prepend older pages.

Base branch: `develop` (post `omp-minimal` merge). Branch:
`feat/session-tail-rehydrate`.
