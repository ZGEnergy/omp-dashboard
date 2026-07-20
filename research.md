# Issue #46 research: long assistant prose is truncated

## Issue statement

GitHub issue #46 reports that assistant `message_end` prose longer than roughly 4,000 characters is stored and rendered with `\n…[truncated]`. Unlike large tool results, the dashboard has no “show full” path for assistant prose. The issue identifies `packages/server/src/memory-event-store.ts` as the likely destructive boundary and asks whether live delivery is affected in addition to replay/history.

## Affected files and interfaces

### 1. `packages/server/src/memory-event-store.ts`

- `DEFAULT_MAX_STRING_SIZE` is `4_000` (line 48).
- `capString()` (lines 55–64) returns an over-limit string prefix plus `\n…[truncated]`. Skill envelopes are a special case: the body is capped while the closing tag and trailing arguments remain intact.
- `truncateStrings()` (lines 65–88) recursively visits object fields and arrays, capping ordinary strings. Image `data` is deliberately exempt when a sibling `mimeType` exists.
- `truncateEvent()` (lines 127–134) applies the string pass to `event.data`, then applies the separate serialized event-data ceiling. The latter can replace data with a small scalar/`__truncated` placeholder when `MAX_EVENT_DATA_SIZE` is exceeded.
- `insertEvent()` stores `truncateEvent(...)` at line 210, before any caller can read or broadcast the event.
- `replaceEvents()` applies the same truncation to every hydrated event at line 253.
- `getEvent()`, `getEvents()`, and `findToolEndEvent()` return the retained stored event; they do not retain or reconstruct the original input.
- `EventStore` (lines 22–35) is the contract consumed by event wiring, gateway/replay code, and REST routes.

Production constructs the store in `packages/server/src/server.ts:631-640`, passing `config.maxStringFieldSize` as the fourth limit argument. The shared configuration says `maxStringFieldSize: 0` means “no truncation” and sets that as the default (`packages/shared/src/config.ts:87-103`), but the store normalizes any non-positive value back to `DEFAULT_MAX_STRING_SIZE` at `memory-event-store.ts:144`. Thus the production default currently resolves to the 4,000-character cap despite the config comment/default.

### 2. Live delivery: `packages/server/src/event-wiring.ts` and `packages/server/src/browser-gateway.ts`

- `wireEvents` handles `event_forward` at `event-wiring.ts:558-570`: it calls `eventStore.insertEvent(sessionId, msg.event)`, then reads `eventStore.getEvent(sessionId, seq)` and passes that stored value to `browserGateway.broadcastEvent`.
- `browserGateway.broadcastEvent` at `browser-gateway.ts:1117-1127` verifies the event is retained, then calls `replayCoordinator.publishLive(sessionId, { seq, event })`.
- `ReplayCoordinator.publishLive` at `replay-coordinator.ts:628-634` sends the stored event as a live `event` frame (or queues it while replay is suppressed). There is no live-path untruncation or full-body lookup.

Therefore the live path is affected: the event is capped before it reaches the gateway. The fallback in `broadcastEvent` for an unretained synthetic frame is not the normal event-wiring path and cannot restore an event already capped by `insertEvent`.

### 3. Replay coordinator: `packages/server/src/replay-coordinator.ts`

- `subscribe()`/`deliverRequestBody()` read `options.store.getEvents(sessionId, 1)` at lines 389–390 and catch-up events at line 426.
- Replay candidates are passed through `prepareEventForReplay(...)` at lines 428 and 455. `packages/shared/src/prepare-event-for-replay.ts` only applies its display-line/byte text truncation specifically to `tool_execution_end.data.result` (`truncateReplayText`, lines 168–183; call at lines 536–538). Its generic `boundEventBytes` limit is a replay transport safeguard, not a source-history copy.
- This means replay’s 4,000-character assistant marker originates in the store, not the replay coordinator.
- The coordinator also supports persisted paging. When retained history has a gap, `loadPersistedSource()` (lines 299–318) reads raw session events from disk. For an older-page request, `persistedRaw` can be selected directly (lines 390–415), so a disk-backed older page may transiently bypass the in-memory string cap. Normal cold/delta replay and any REST read still use the capped store. `ensureHydrated()` calls `store.replaceEvents(...)` (lines 321–329), so a cold disk hydration subsequently stores capped copies.

### 4. Subscription handler: `packages/server/src/browser-handlers/subscription-handler.ts`

- `windowEventsForSubscribe()` (lines 44–93) filters deltas and selects tail/older windows by byte budget; it does not restore or alter assistant text.
- The legacy/fallback `sendEventBatches()` (lines 99–159) maps each event through `truncateToolResultForReplay()` only (lines 146–150). `packages/server/src/replay-truncate.ts` explicitly keeps the full tool result in the store for the separate full-result route; no equivalent exists for assistant prose.
- `handleSubscribe()` reads `eventStore.getEvents(...)` in the normal, stale-cursor, load-older, and post-hydration branches (for example lines 300–365 and 404–435). Lazy disk hydration inserts each raw result event with `eventStore.insertEvent()` at lines 394–400, so the store cap happens before replay. When a replay coordinator is installed, `handleSubscribe()` delegates at lines 295–297 and follows the coordinator path above.

### 5. REST routes: `packages/server/src/routes/session-routes.ts`

- `GET /api/events/:sessionId/:seq` (lines 29–39) returns `eventStore.getEvent(...)`; it exposes the capped event and has no original-payload source.
- `GET /api/sessions/:sessionId/tool-result/:toolCallId` (lines 41–59) is intentionally a full-result route for `tool_execution_end`; it cannot find assistant prose.
- `GET /api/session-change/:sessionId/:toolCallId` (lines 61–85) reads a session JSONL payload for Write/Edit diffs only; it is not a general assistant-message recovery route.

## Existing coverage

- `packages/server/src/__tests__/memory-event-store.test.ts` covers:
  - image data preservation and ordinary `data` truncation (lines 152–189);
  - skill-envelope shape preservation under the production default cap (lines 191–216);
  - custom positive string caps and the exact marker (lines 274–314);
  - over-ceiling tool identity retention (lines 316–350);
  - serialized-size/deep-tree limits and the bounded broadcast source (`getEvent`) (lines 483–567).
- `packages/server/src/__tests__/replay-coordinator.test.ts` covers assistant stream compaction and a short final assistant answer (lines 120–167), replay barriers/live ordering (lines 193–216), queue/byte limits, persisted older paging (lines 315–342), and asset/replay behavior. It does not assert that a >4,000-character assistant `message_end` remains complete in the store, live frame, replay frame, or `/api/events` response.
- `packages/server/src/__tests__/subscription-handler.test.ts` covers delta/stale/full/tail selection, disk hydration, replay suppression, and asset registration. Its large payloads use generic `pad` fields; it has no long assistant prose assertion and does not test the live broadcast path.
- `packages/server/src/__tests__/replay-truncate.test.ts` and client truncation tests cover the intentional tool-output replay/display marker, reinforcing that tool full-body behavior is separate from assistant messages.
- No focused test currently proves a long assistant message survives `insertEvent`, `replaceEvents`, live publish, replay, and event REST lookup together.

## Data-loss risks

1. **Authoritative in-memory loss:** `insertEvent()` and `replaceEvents()` discard the original assistant string, so subsequent `getEvent()`/`getEvents()`/`find...` callers cannot recover it from memory.
2. **Live and replay both inherit the loss:** event wiring broadcasts `getEvent()` and replay reads the same store, so reload/replay is not the only affected mode.
3. **No assistant recovery endpoint:** `/api/events` returns the capped object; the full-result endpoint is keyed only to tool-call IDs and returns tool results.
4. **Hydration can permanently replace raw history with capped copies:** the normal lazy load and `ensureHydrated()` paths populate/replace the store through the truncating APIs.
5. **Persisted older-page exception can make behavior inconsistent:** when a retained-history gap exists and a session file is available, replay-coordinator older paging may select raw disk events before they are reinserted. This does not provide general recovery and is not available to live frames, normal store reads, or all sessions.
6. **A blanket cap increase/removal has resource consequences:** assistant prose can be large; any fix must retain the existing replay frame/event byte bounds and event-data ceiling (or add a field-specific policy) rather than removing all protections.
7. **Config semantics are already inconsistent:** the documented/default zero value means “no truncation,” but `createMemoryEventStore` treats zero as “use 4,000.” Changing this globally could affect memory and bandwidth for every large string field, not just assistant prose.

## Recommended minimal approach

Make assistant prose exempt from the *source-store string-field cap* while keeping bounded transport behavior separate:

1. In `memory-event-store.ts`, identify assistant text in the relevant assistant `message_start`/`message_update`/`message_end` payload shape and preserve that text through `truncateStrings` (including `replaceEvents`). Keep normal string caps for unrelated fields, image handling, and `MAX_EVENT_DATA_SIZE` intact. Prefer a narrowly scoped predicate/field rule over globally treating `maxStringFieldSize <= 0` as unlimited.
2. Preserve `prepareEventForReplay`’s per-event/frame byte controls so a very large assistant event is bounded for WebSocket delivery without overwriting the authoritative stored body. If a single assistant event can exceed the frame limit, use the existing replay preparation/transport contract or introduce an explicit full-body retrieval path rather than allowing an unbounded frame.
3. Add focused regression coverage (in a future implementation, not this research task) for: store insert and replace preserving a long assistant `message_end`; live event wiring/gateway receiving the full stored text; replay after cold subscribe preserving it; and `/api/events/:sessionId/:seq` returning the full text. Keep tool-result replay truncation/full-result behavior unchanged.
4. Separately decide whether to correct the config contract (`maxStringFieldSize: 0`) or leave it for a distinct change; do not make that global semantic change as an incidental part of the assistant-prose fix.

This approach directly fixes the irreversible source-data loss while retaining replay/cache/window limits as independent safeguards, matching the issue’s contrast with tool-output full-result behavior.
