## Context

- Subscribe is already incremental via `lastSeq` (`subscription-handler.ts`).
- Strategy A persists raw events in IndexedDB and delta-subscribes on reload
  (`replay-cache.ts`, `rehydrate-session.ts`, `App.tsx`).
- Large sessions exceed `DEFAULT_MAX_BYTES_PER_SESSION` (5 MiB) → put deletes
  the entry → every cold open is full replay.
- Server cold path loads full JSONL then ships all stored events in batches of
  50 with `MAX_REPLAY_EVENTS = 0` (unlimited).
- ChatView `scrollStateMap` is in-module only; restore runs only on `sessionId`
  change. Wipe→rebuild of the same session does not re-pin.

## Goals

1. Cold open of a large session transfers **O(budget)** events, not full history.
2. Large sessions remain **cacheable** under a byte budget (newest-first).
3. Users can **page older history** without losing the current viewport.
4. After hydrate, default land position is **true bottom** (unless user escaped).
5. Legacy clients (no `mode`) keep full-replay behavior.

## Non-Goals

See proposal. Notably: durable last-seen anchor and estimate-drift fixes stay
out of this change.

## Decisions

### D1 — Byte budget, not turn count

**Choice:** Keep newest events until ~**4 MiB** serialized payload.

**Why:** Turn boundaries are uneven (one tool-heavy turn can be multi-MB). A
byte budget gives a hard wire/IDB ceiling. Client and server share the same
selection algorithm so cache tail ≈ first paint tail.

**Default:** `DEFAULT_TAIL_WINDOW_BYTES = 4 * 1024 * 1024`. Client may pass
`windowBytes` on subscribe; server clamps to `[256_KiB, 8_MiB]`.

### D2 — Newest-first selection, whole events only

```
selectNewestEventsByBudget(eventsSortedBySeqAsc, budget):
  walk from end → start
  include event if size(event) + acc <= budget OR acc == 0 (always include newest)
  stop when next would exceed
  return included in ascending seq order
```

Size = `JSON.stringify({ seq, event }).length` (same as cache put today) for
determinism between client trim and server wire estimate. Never split an event.

**Incomplete oldest message:** If the oldest kept event is a `message_update`
without its `message_start` in the window, still keep it — reducer already
tolerates partial streams for display of finalized `message_end` when present.
Do **not** expand the window past budget to complete pairs (budget is hard).

### D3 — Additive protocol (no new message type for v1)

**Subscribe (browser → server):**

| Field | Type | Meaning |
|---|---|---|
| `mode?` | `"full" \| "tail"` | Default `"full"` (legacy). Cold open uses `"tail"`. |
| `windowBytes?` | number | Budget hint; server clamps. |
| `fromSeq?` | number | Load-older: exclusive upper bound (`seq < fromSeq`). |

**Event replay (server → browser):**

| Field | Type | Meaning |
|---|---|---|
| `hasMoreOlder?` | boolean | More history exists below `windowMinSeq`. |
| `windowMinSeq?` | number | Lowest seq in the retained/delivered window. |
| `windowMaxSeq?` | number | Highest seq in this delivery (usually = last event seq). |

**Matrix:**

| Client | Server |
|---|---|
| omit `mode` / `mode:"full"` | Today's full (or delta) path |
| `mode:"tail"`, no `fromSeq`, `lastSeq` 0/absent | Newest budget window from store or disk |
| `mode:"tail"`, `lastSeq > 0` | Delta `seq > lastSeq` only (mode ignored for delta) |
| `fromSeq: N` | Older page: newest events with `seq < N` under budget |
| store empty + disk | Load disk; apply same window before send |

Warm reconnect with live `lastSeq` is unchanged.

### D4 — Client cache: trim-to-tail, schema v2

- On put: if full buffer serializes over budget, trim with
  `selectNewestEventsByBudget` then put. **Never** delete solely for size.
- Persist `{ maxSeq, windowMinSeq, payload, schemaVersion: 2 }`.
- v1 entries: schema mismatch → miss → tail subscribe (safe).
- `session_state_reset` still `drop()`s the entry.

### D5 — Load-older preserves scroll anchor

When prepending older rows:

1. Snapshot first visible virtual row key + offset before prepend.
2. Apply older events (prepend to reducer state / merge by seq).
3. Restore anchor via `scrollToIndex` + offset (same CR-6 virtual coords as
   session restore).

Do not `session_state_reset` for older pages. Do not clear stick-to-bottom
latch incorrectly: load-older implies user is at top → stick stays false.

### D6 — Post-hydrate re-pin

When `loadingHistory` goes `true → false` for the active session:

- If `stickToBottomRef` is true **or** no user scroll-up occurred during this
  hydrate (`!userEscapedDuringHydrate`), pin bottom once.
- If user wheeled/touched away mid-hydrate, respect escape (existing
  `cancelDescent` / scroll handler).

This fixes wipe→rebuild same-`sessionId` without durable last-seen.

### D7 — Shared pure helper location

Prefer `packages/shared/src/event-window.ts` (or under existing shared event
util path) so client IDB put and server subscribe use one implementation and
one unit test file. Server-only copy is acceptable only if shared import is
awkward for the worker thread; prefer shared.

## Risks

| Risk | Mitigation |
|---|---|
| Budget too small → thin context | 4 MiB default; clamp max 8 MiB; load-older |
| Budget too large on mobile | Clamp; measure hydrate time in manual smoke |
| `hasMoreOlder` wrong after store essential-trim | Compare `windowMinSeq` to buffer min seq; disk cold load may still have older not in memory — if only memory is searched, document that load-older may need disk path (reuse `loadSessionEvents` windowed) |
| Double full load on disk cold | Load once; window in memory; page older from same buffer |
| Fork / seq reset | Existing reset purge |
| Prepend scroll jump | Anchor restore required in acceptance |

## Open questions (resolve in tasks 1.x if needed)

1. Should load-older use the same `subscribe` message or a one-shot
   `load_history`? **Lean subscribe + `fromSeq`** (fewer types). Confirm if
   re-entrancy with live subscribe set is awkward.
2. Exact clamp bounds (256 KiB–8 MiB) — tune after first large-session smoke.
