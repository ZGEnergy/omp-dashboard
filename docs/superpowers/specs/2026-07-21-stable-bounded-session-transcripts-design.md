# Stable bounded session transcripts design

**Date:** 2026-07-21  
**Status:** Approved design  
**Scope:** GitHub issues #59 and #48  
**Baseline:** PR #53 merged at `deb6edec`

> **Superseded (Phase 2 & 3):** #48 client plan replaced by `2026-07-22-omp-hot-transcript-budget-design.md` — single-cursor eviction, invisible eviction UX, cold-start no-visible-replay, server paging deferred. Phase 1 (#59) shipped, stays authoritative.

## Problem and goals

Issue #59 comes first.

In-app session navigation can clear and replay retained transcript state.

A→B→A navigation must keep session A mounted and land at newest activity.

Compatible WebSocket reconnect must apply delta events without empty or loading UI.

Full dashboard restart remains normal cold hydration.

Issue #48 follows #59.

Long sessions retain unbounded derived browser and server state after older-page loads.

Hot transcript state must remain bounded by bytes and active-state pins.

Older history must remain reloadable from raw JSONL through stable sequence cursors.

Server replay must materialize bounded pages without routine full-branch arrays.

Raw JSONL remains audit and exact-recovery authority.

All replay and hot-window behavior must expose bounded, payload-free measurements.

## Non-goals

- Delete raw JSONL.
- Summarize raw JSONL into replacement history.
- Change omp model-context compaction behavior.
- Use DOM virtualization as memory policy.
- Remove `Load older`.
- Treat routine eviction as transcript reset.
- Change raw JSONL authority or audit semantics.

## Current findings

`App.tsx` currently derives replay-controller authority from `serverEpoch:connectionEpoch`.

`App.tsx` clears `subscribedRef` and recreates replay controller when transport generation changes.

Ordinary A→B→A navigation on one transport already retains session state.

PR #53 caps `SessionReplayLedger`, `ReplayPersister`, and IndexedDB replay cache at 10 MiB.

Reducer and detail structures remain unbounded.

`SessionState.messages` remains unbounded.

Tool-call, subagent, interactive-request, and subagent-detail maps remain unbounded.

Server full-source arrays remain unbounded during persisted replay.

`packages/server/src/session-file-reader.ts` reads and parses full selected branch before returning it.

`packages/server/src/replay-coordinator.ts` caches full projected source before selecting bounded pages.

`packages/client/src/lib/session-replay-ledger.ts` owns canonical sequence admission and current retained window.

`packages/client/src/lib/replay-persist.ts` writes replay entries to durable cache and holds pending writes.

`packages/client/src/lib/event-reducer.ts` builds messages, tool state, subagent state, interactive requests, and detail maps.

`packages/client/src/components/ChatView.tsx` derives transcript rows and virtualizes DOM rows; virtualization does not bound source arrays or reducer work.

Current replay protocol already carries `sourceGeneration`, `replayKind`, `windowMinSeq`, `windowMaxSeq`, `retainedMinSeq`, `hasMoreOlder`, and `partialHead`.

Current subscribe protocol already supports `knownSourceGeneration`, `lastSeq`, and exclusive `fromSeq`.

## Architecture boundaries

### Authority layers

`SessionAuthority` owns retained per-session state independent of transport attachment.

`TransportAttachment` owns WebSocket subscription and in-flight request state.

`SessionAuthority` contains:

- `SessionReplayLedger`.
- Reducer projection.
- Maximum admitted cursor.
- Stable source generation.
- Replay window metadata.
- `ReplayPersister`.
- Scroll checkpoint and anchor token.
- Evicted-range manifests.
- Hot-window budget and high-water counters.

`TransportAttachment` contains:

- Current `connectionEpoch`.
- Selected-session subscription set for current socket.
- In-flight request IDs.
- Request abort state.
- Replay barrier state.
- Delivery overflow state.

`serverEpoch` identifies server boot/source namespace.

`connectionEpoch` identifies one browser transport generation.

`sourceGeneration` identifies stable branch authority for one selected source branch.

Compatible append extends this generation's manifest without changing `sourceGeneration`.

`hotEvictionRevision` identifies server hot-store changes and never replaces `sourceGeneration`.

Authority identity uses `(sessionId, serverEpoch, sourceGeneration)`.

Transport attachment identity uses `(sessionId, connectionEpoch)`.

Authority survives compatible `connectionEpoch` changes.

Authority replacement requires source-generation replacement or explicit destructive reset.

## Phase 1 — issue #59 lifecycle

### Retention and reconnect

Store `SessionAuthority` in a per-session map outside transport-scoped controller state.

Keep ledger, reducer projection, max cursor, source generation, replay window, persister, scroll checkpoint, and range manifests across compatible `connectionEpoch` changes.

On transport reconnect, clear only subscription membership, in-flight requests, request aborts, and replay barriers.

Do not clear retained authority on compatible reconnect.

For selected session with retained authority, send one `subscribe` with `lastSeq = maxCursor` and `knownSourceGeneration = sourceGeneration`.

Mark request trigger `transport_reconnect`.

Apply returned delta off-screen.

Keep retained transcript mounted while delta runs.

Land at newest activity after delta terminal.

For inactive retained sessions, send no reconnect request.

When inactive retained session becomes selected, send no replay subscribe if current transport still has its attachment.

When inactive retained session becomes selected after compatible reconnect, send one delta subscribe from retained cursor.

On same-transport A→B→A, retain A attachment record and authority.

On same-transport A→B→A, send zero replay subscribe requests for A.

On same-transport A→B→A, keep A transcript mounted and restore newest scroll checkpoint.

Full app restart creates empty authority map and performs normal cold hydration of selected session.

Full app restart uses trigger `initial_navigation`.

### Source replacement and destructive reset

Source replacement occurs when server reports new `sourceGeneration` or `session_state_reset`.

Explicit destructive reset uses the same replacement transaction.

Replacement transaction locks session authority, records old generation, and stops incompatible requests.

Replacement transaction stages new generation, resets staged cursor and range manifests, and creates new persister scope.

Replacement transaction publishes source-reset metadata without clearing visible old projection.

At fenced replacement terminal, atomically swap visible authority to staged generation and clear old ledger and derived projection.

If old authority fails source fence before terminal, clear visible old projection and show recovery.

Retained old tail remains visible until fenced replacement terminal when old authority remains safe to display.

Recovery UI appears only when no retained authoritative transcript exists or old authority fails source fence.

Source replacement uses trigger `source_reset`.

### Trigger enum

Replay activity uses exact enum:

```ts
type ReplayTrigger =
  | "initial_navigation"
  | "transport_reconnect"
  | "source_reset"
  | "cache_miss"
  | "explicit_history_load";
```

`initial_navigation` marks full app restart cold hydration and first selected-session hydration.

`transport_reconnect` marks compatible delta subscribe after socket replacement.

`source_reset` marks source-generation replacement or explicit destructive reset recovery.

`cache_miss` marks recovery when requested retained authority or durable cache entry does not exist.

`explicit_history_load` marks `Load older` requests only.

Routine eviction does not create a replay trigger.

Same-transport A→B→A creates no replay activity.

### Visibility rules

Retained transcript stays visible during compatible reconnect.

Delta events merge without replacing retained reducer projection.

Historical backfill remains off-screen until page terminal and anchor restoration.

Newest tail remains visible during older-page requests.

Replacement may retain old tail until terminal only when source generation and sequence identity remain safe.

Recovery state renders when authority is absent, invalid, or explicitly replaced.

Loading indicator never represents a compatible reconnect with retained authority.

## Phase 2 — issue #48 client resident ranges

### Resident range model

Replace one unbounded canonical working set with byte-aware resident ranges.

Each resident range records:

```ts
type ResidentRange = {
  sourceGeneration: string;
  startSeqInclusive: number;
  endSeqExclusive: number;
  rawBytes: number;
  projectedBytes: number;
  detailBytes: number;
  eventCount: number;
  pinned: boolean;
  reason: "tail" | "active" | "viewport" | "checkpoint";
};
```

Resident ranges remain contiguous and ascending per source generation.

Range boundaries never split one admitted event.

`DEFAULT_REPLAY_RETENTION_BYTES` remains canonical raw replay cap at 10 MiB.

Each resident range accounts raw bytes, projected bytes, and detail bytes.

One canonical raw event representation backs ranges, persister state, and replay admission; implementation MUST NOT create independent full-history copies.

Configured fixed caps cover canonical raw bytes, projected bytes, detail bytes, and aggregate hot-window bytes.

Eviction continues until every configured fixed cap passes.

Newest tail remains pinned.

Current user turn remains pinned until terminal.

Current assistant turn remains pinned until terminal.

Active tool calls remain pinned until terminal or explicit terminal-error state.

Active subagent runs remain pinned until terminal.

Active interactive requests remain pinned until response or cancellation.

Active decision and constraint entries remain pinned while referenced by active detail state.

Active pins remain bounded by per-field and detail caps.

Current-turn, tool, subagent, and interactive pins override oldest-range eviction only within those fixed caps.

Historical viewport range remains resident while visible and while its scroll anchor is pending.

Eviction chooses oldest complete unpinned ranges first.

Eviction never removes newest tail, active pins, or pending scroll-anchor range.

### Atomic eviction

Evict one complete range in one authority transaction.

Remove range entries from `SessionReplayLedger.bySeq`.

Remove corresponding entries from `ReplayPersister` memory and pending batch.

Remove corresponding reducer messages.

Remove tool-call detail entries with no retained references.

Remove subagent detail entries with no retained references.

Remove interactive detail entries with no retained references.

Remove derived view inputs whose sequence range no longer remains resident.

Add one compact evicted-range manifest.

Persist manifest before releasing range authority.

If any structure cannot evict atomically, retain complete range and report eviction failure.

Eviction acts as pagination, never cold reset.

### Evicted-range manifest

Manifest bounds use `[fromSeqInclusive, toSeqExclusive)`.

Manifest includes source generation, sequence bounds, event count, byte count, and last known cursor.

Manifest never includes transcript content.

Adjacent manifests with equal source generation may coalesce.

A `Load older` request selects nearest manifest below current minimum sequence.

A successful page removes or shrinks only covered manifest bounds.

A failed page preserves manifest and visible range marker.

### ChatView derivation

`ChatView` derives rows only from resident ranges plus pinned active detail.

Selectors reject sequence entries outside resident ranges.

Grouping and summaries consume range-bounded inputs.

DOM virtualization remains rendering optimization only.

`Load older` remains visible whenever `hasMoreOlder` or an evicted manifest indicates older source.

Older-page terminal restores saved scroll anchor before exposing new rows.

Newest tail and current activity remain visible after range admission or eviction.

### Preserved client state

Every routine eviction preserves:

- Maximum cursor.
- `sourceGeneration`.
- `hasMoreOlder`.
- `partialHead`.
- Evicted-range manifests.
- Scroll anchor and checkpoint.
- Newest tail.
- Active pinned state.
- `Load older` affordance.

## Phase 3 — issue #48 server source paging

### Streaming manifest

Add source-generation-bound streaming manifest reader beside `loadSessionEntries`.

Manifest persists as a source-generation-keyed disk sidecar beside raw JSONL.

Manifest creation streams raw JSONL once and records branch authority, JSONL byte offsets, stable projected sequence mapping, and replay-state checkpoints.

Manifest creation does not retain full branch arrays.

In-memory manifest cache uses bounded LRU entries containing page headers and checkpoints only.

Total history MUST NOT create a full resident in-memory manifest.

Manifest records session file identity, source generation, leaf identity, branch parent links, projected sequence bounds, event offsets, checkpoint offsets, and checksum inputs.

Stable projected sequence mapping assigns one ascending sequence to each replay event on selected branch.

Checkpoint interval uses a fixed event or byte stride from configuration.

Checkpoint stores reducer replay state needed to resume projection at nearest boundary.

Checkpoint payload excludes raw transcript content not needed for replay state.

Raw JSONL remains source authority.

### Bounded requests

Tail request seeks newest valid checkpoint and reads bounded forward source bytes.

Older request seeks nearest checkpoint below exclusive `fromSeq` and reads bounded page bytes.

Reader materializes only selected page events and bounded checkpoint state.

`replay-coordinator.ts` sends contiguous ascending pages.

Every page preserves exclusive `fromSeq` semantics.

Every page carries source-generation fence.

Newest-tail request remains anchored at newest source sequence.

Page size respects event-window and wire backpressure budgets.

Server never parses full selected branch on routine tail or older request.

### Manifest lifecycle

Stable source authority generation changes on source replacement, branch leaf change, malformed source repair, or file identity change.

Hot-store eviction increments `hotEvictionRevision` only.

Hot-store eviction does not change source generation.

Append extends manifest when append preserves selected branch and sequence mapping.

Leaf change invalidates branch-dependent manifest and creates new source generation.

Manifest invalidation cancels requests using old manifest.

Reader rebuilds manifest before serving next fenced request.

Full-reader fallback runs only when manifest invalid or unavailable.

Fallback records measured reason and source bytes read.

Fallback never runs as routine path.

### Protocol invariants

`fromSeq` remains exclusive.

Page events ascend by sequence.

Page sequence ranges remain contiguous within each response stream.

Source-generation mismatch rejects page admission.

Newest-tail response ends at newest available sequence for fenced generation.

`hasMoreOlder` reflects source events below returned minimum sequence.

`partialHead` reflects incomplete semantic head at returned minimum sequence.

`retainedMinSeq` reflects server hot-store range, not source authority minimum.

## Data flow and state lifecycle

| Situation | Client authority | Request | Visibility result |
|---|---|---|---|
| App restart / first navigation | Empty | `subscribe` cold tail; trigger `initial_navigation` | Show initial loading or recovery until terminal; reveal newest tail; backfill older history off-screen. |
| Same-socket A→B→A | A authority retained; A attachment retained | No replay subscribe for A | Keep A transcript mounted; restore newest scroll checkpoint. |
| Compatible reconnect | Authority retained; transport attachment reset | Selected session delta with `lastSeq = maxCursor`, `knownSourceGeneration`; trigger `transport_reconnect` | Keep retained transcript visible; merge delta; land newest; no empty/loading state. |
| Source reset / destructive reset | Old authority replaced atomically | New-generation cold tail; trigger `source_reset` | Keep old tail until safe terminal when fenced; otherwise show recovery; reveal new generation after terminal. |
| Explicit `Load older` | Tail and manifests retained | Older page with exclusive `fromSeq = currentMinSeq`; trigger `explicit_history_load` | Keep newest tail visible; admit page; restore scroll anchor; keep marker on failure. |
| Routine eviction | Tail, pins, cursor, manifests retained | No cold request; later older request uses manifest | Keep current tail and active detail visible; show collapsed older-range marker. |
| Cache miss | No usable retained authority or requested cache range absent | Cold tail or range page; trigger `cache_miss` | Show recovery only when no retained authority exists; otherwise keep tail and show retryable range marker. |

## State invariants

A retained authority always has one source generation.

A transport attachment never owns canonical transcript state.

A compatible reconnect never clears retained reducer projection.

A same-transport session revisit never emits replay subscribe.

Every admitted event has one source generation and one stable sequence.

Every resident range uses one source generation.

Evicted ranges remain addressable by exclusive sequence bounds.

Eviction never changes maximum cursor.

Eviction never changes source generation.

Eviction never removes active pins.

Older-page admission never removes newest tail.

Source replacement changes generation before new events enter authority.

Malformed or missing source never becomes empty successful history.

Every replay terminal correlates request ID, session ID, replay kind, and source generation.

Client derivation consumes resident ranges only.

Raw JSONL remains recoverable regardless of hot-window eviction.

## Observability

Expose additive payload-free replay activity through `/api/health` aggregation.

Each replay activity record contains:

```ts
type ReplayActivity = {
  sessionId: string;
  requestId: string | null;
  at: string;
  trigger: ReplayTrigger;
  kind: "cold" | "delta" | "older";
  sourceGeneration: string;
  sessionCount: number;
  eventCount: number;
  payloadBytes: number;
  sourceBytesRead: number;
  pageBytes: number;
  cursorFromExclusive: number | null;
  cursorToInclusive: number | null;
  highWaterBytes: number;
  evictions: number;
  hydrationSource: "memory" | "cache" | "manifest" | "full_reader";
  derivationDurationMs: number | null;
};
```

Server health exposes bounded aggregate counts and bounded records by trigger and kind.

Each health response caps activity records at a fixed maximum and aggregates older activity.

Server health exposes bounded high-water values for source reads, page bytes, and hot-store bytes.

Client reports use the same fields without transcript content, message text, tool arguments, images, or raw events.

Client reports rate-limit by session and trigger.

Client reports cap retained key cardinality and aggregate bytes.

`/api/health` response remains bounded by fixed sample and aggregate limits.

`replay_diagnostic` remains metadata-only.

Metrics distinguish source bytes read from projected replay bytes.

Metrics distinguish `sourceGeneration` from `hotEvictionRevision`.

## Error handling

### Cursor gap

Reject non-contiguous page admission.

Keep visible tail and current range marker.

Record `sequence_gap` diagnostic with bounded metadata.

Offer retry from retained cursor.

Do not clear authority for one routine page failure.

### Generation mismatch

Reject frame or page whose source generation differs from authority.

Cancel incompatible in-flight request.

If replacement source exists, run source-reset recovery.

If no replacement authority exists, show recovery state.

Record generation mismatch without transcript content.

### Manifest invalidation

Stop manifest request before page admission.

Rebuild manifest from raw JSONL.

Retry one bounded request against new generation.

Use full-reader fallback only when rebuild cannot produce valid manifest.

Keep existing visible tail while rebuild runs when authority remains valid.

### Malformed or missing source

Return explicit `malformed_source` or `missing_source` terminal error.

Never return empty success for malformed or missing source.

Keep retained tail when source generation remains valid.

Show recovery only when retained authority is absent or fenced out.

### Delivery overflow

Stop sending when WebSocket buffered amount exceeds configured threshold.

Preserve unsent page cursor and request correlation.

Return bounded overflow terminal or retryable marker.

Keep visible tail and already admitted ranges.

Retry from exclusive cursor without duplicate admission.

## Testing and acceptance mapping

### Issue #59 acceptance

`packages/client/src/__tests__/session-replay-cache-admission.test.ts` covers cache admission and empty correlated delta terminal.

Extend `SessionReplayController` tests for A→B→A with zero replay subscribe calls.

Extend `App.tsx` lifecycle coverage for retained state across compatible `connectionEpoch` change.

Assert compatible reconnect sends delta only from retained cursor.

Assert compatible reconnect never renders empty/loading state while retained authority exists.

Assert source reset replaces authority atomically and exposes recovery only without retained authority.

Assert `cache_miss` recovery preserves retained tail when possible.

Assert `initial_navigation`, `transport_reconnect`, `source_reset`, `cache_miss`, and `explicit_history_load` trigger values.

`tests/e2e/mobile-session-replay.spec.ts` covers mobile replay behavior.

`tests/e2e/replay-delta-on-reload.spec.ts` covers delta replay on reload.

`tests/e2e/navigation.spec.ts` covers navigation surfaces.

Add desktop and mobile A→B→A regression assertions.

### Issue #48 client acceptance

Add unit tests for byte-aware resident-range admission and eviction.

Add reducer tests proving atomic removal across messages, tool calls, subagents, interactive requests, and derived view inputs.

Add persister tests proving evicted ranges leave bounded memory and durable manifests retain cursors.

Add range tests proving repeated `Load older` remains bounded.

Assert `hasMoreOlder`, `partialHead`, newest tail, scroll anchor, and `Load older` survive routine eviction.

Assert older-page failure keeps visible tail and retry affordance.

`packages/client/src/__tests__/state-replay.test.ts` and `state-replay-text-tool-order.test.ts` remain replay projection coverage.

### Issue #48 server acceptance

`packages/server/src/__tests__/session-file-reader.test.ts` covers JSONL reading and branch behavior.

`packages/server/src/__tests__/replay-coordinator.test.ts` covers tail, delta, older pages, contiguous sequences, and replay barriers.

`packages/server/src/__tests__/replay-coordinator-wire-limits.test.ts` covers wire limits and overflow boundaries.

`packages/shared/src/__tests__/event-window.test.ts` covers byte windows, partial heads, and exclusive older selection.

`packages/shared/src/__tests__/replay-protocol.test.ts` covers generation-bound replay messages.

Add manifest tests for branch leaf selection, offsets, checkpoints, append extension, leaf invalidation, malformed source, and bounded materialization.

Assert routine tail and older requests do not retain full branch arrays.

Assert full-reader fallback occurs only for invalid or unavailable manifest and records measured source bytes.

### Desktop and mobile end-to-end

Desktop Playwright asserts A→B→A zero replay subscribe and newest-tail anchor.

Mobile Playwright asserts A→B→A zero replay subscribe, compatible reconnect delta, and scroll anchor continuity.

Desktop and mobile Playwright assert source reset and cache-miss recovery states.

Desktop and mobile Playwright assert repeated `Load older` keeps bounded resident bytes and visible anchor.

Playwright assertions inspect request metadata and UI state, never transcript payload.

## Implementation slices and dependencies

### Slice A — issue #59 lifecycle, observability, regressions

Change retained authority lifetime and transport attachment lifetime.

Add trigger enum and payload-free replay activity.

Add compatible reconnect delta behavior.

Add source-reset and cache-miss recovery behavior.

Add A→B→A desktop and mobile regressions.

Likely files include `packages/client/src/App.tsx`, `packages/client/src/hooks/useSessionReplayController.ts`, `packages/client/src/lib/session-subscribe.ts`, replay cache/persistence libraries, shared browser protocol types, gateway health aggregation, and replay lifecycle tests.

After Slice A, lock source cursor, source-generation fence, exclusive `fromSeq`, and replay terminal contract.

### Slice B — issue #48 client range budgets

Begin only after Slice A contract lock.

Add resident ranges, manifests, byte budgets, atomic eviction, reducer/detail pruning, and bounded ChatView derivation.

Likely files include `packages/client/src/lib/session-replay-ledger.ts`, `packages/client/src/lib/replay-persist.ts`, `packages/client/src/lib/event-reducer.ts`, `packages/client/src/components/ChatView.tsx`, replay hooks, and client unit tests.

Slice B may proceed in parallel with Slice C after Slice A contract lock.

### Slice C — issue #48 server paging

Begin only after Slice A contract lock.

Add streaming source manifest/checkpoint reader and bounded replay-coordinator page reads.

Keep raw JSONL authority and measured fallback.

Likely files include `packages/server/src/session-file-reader.ts`, `packages/server/src/replay-coordinator.ts`, server event-store adapters, shared replay protocol/window types, and server/shared unit tests.

Slice C may proceed in parallel with Slice B after Slice A contract lock.

### Final integration

Integrate Slice B and Slice C against Slice A lifecycle.

Validate source-generation fences, cursor continuity, active pins, eviction metrics, source-read metrics, and derivation duration.

Run desktop and mobile end-to-end acceptance suite.

## Risks and mitigations

`replayEntriesAsEvents` may require complete context to project one event.

Mitigation: checkpoint reducer state at manifest boundaries and keep active-turn source range pinned.

Branch and leaf authority may change while manifest builds.

Mitigation: fence manifest by source generation and leaf identity; discard stale manifest atomically.

Active detail pinning may retain large tool or subagent payloads.

Mitigation: count detail bytes separately, cap detail payload fields, and retain only active references plus bounded terminal summaries.

Scroll anchors may refer to evicted rows.

Mitigation: pin anchor range until terminal and restore by stable sequence plus row fallback.

Sequence identity may drift after branch replacement.

Mitigation: source-generation fence every range, cursor, manifest, cache key, and terminal.

Metrics may add replay CPU or memory overhead.

Mitigation: sample bounded hot-window state, use counters and byte totals, rate-limit client reports, and exclude payloads.

Delivery overflow may leave partial page admission.

Mitigation: admit only complete bounded frames, retain exclusive cursor, and retry idempotently.

Routine eviction may be mistaken for authority loss.

Mitigation: preserve tail, cursor, generation, manifests, and explicit collapsed-range marker; emit distinct eviction and authority-loss diagnostics.

## Approval boundary

This design covers issue #59 before issue #48.

PR #53 baseline remains prerequisite and stays unchanged.

Implementation must preserve raw JSONL, source-generation fences, bounded pages, reconnect correctness, and `Load older`.
