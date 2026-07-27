# Hydration tool-stub projection — design

Date: 2026-07-27
Status: approved design, not yet implemented
Supersedes: PR #102 (reverted in PR #103)
Refs: #48 (bounded hot transcript), #77 (seq-addressable range paging), #101 (tool-burst hydration stall)

## Problem

Hydration must fit a long session into a bounded tail budget (default 1.5 MiB).
A single large subagent tool burst can consume the entire budget, leaving the
user with a transcript containing no readable chat (#101). Separately, a very
long-running session grows client working memory without bound (#48).

PR #102 attempted this and was reverted. It dropped every `message_update` in
any turn that had a `message_end`, so the assistant's prose no longer existed as
positioned events; the reducer rebuilt it at `message_end`, which sorts after
the turn's tool events. Every turn containing a tool call rendered as a wall of
tool results followed by a lump of text, and text written between two tool calls
collapsed into one block at the end of the turn. It also discarded ~84% of
events (912 → 144 in a representative tool-heavy session) and introduced a
sparse-coverage model whose contiguity validation could reject a window
outright.

## The invariant

> Projection may **reduce** events. It may never **move** them. Every surviving
> event keeps its original `seq`, and no surviving event's content may depend on
> an event with a higher `seq`.

#102 violated the second clause. Every rule below is checked against it.

## Architecture

Three layers, consistent with #48:

- **Cold** — raw JSONL. Authoritative, never mutated. Sole source for on-demand
  re-inflation.
- **Warm** — server-side projection, computed per hydration request. Coalesces,
  stubs, byte-budgets. Stateless: same input range + same budget ⇒ same output.
- **Hot** — client ledger/reducer state. Applies the same degradation ladder
  under memory pressure, using the same stub shape.

### Degradation ladder

One axis, four rungs. A tool call moves down it; it re-inflates from any rung
through a single fetch path.

```
full payload → stub (head/tail slice) → metadata-only stub → EvictedToolBurst marker
```

Server hydration enters the ladder at whatever rung the budget allows. Client
eviction (`evictBelow`) walks the same ladder as memory pressure rises. The
existing `EvictedToolBurst` marker becomes the ladder's bottom rung rather than
a parallel mechanism.

### Anchoring rules

1. A coalesced tool call anchors at its **`tool_execution_start` seq**. That is
   where the reducer creates the tool row today, so the row does not move.
   (#102 anchored at the end seq — a second ordering defect, visible when the
   assistant streams text during a long-running call.)
2. A coalesced `message_update` run anchors at the **last update in the run**.
   Any non-update event splits the run, so text before a tool stays before it.

## Coalescing rules

Order-preserving, applied to a contiguous ascending range:

**Tool events.** Group `tool_execution_*` by `toolCallId`. Replace the group
with one event at the start seq, merging: tool name, args, terminal status,
final result. Superseded progress updates are discarded.

**Message updates.** Collapse each *consecutive* run of `message_update` events
to its last member. A run is broken by any event of another type. This captures
the dominant memory win — `message_update` carries *cumulative* content, so a
reply streamed over N updates costs O(N × length) — with no ordering risk.

**Everything else** passes through untouched.

Output seqs are a subset of input seqs in ascending order. Because coalesced
events collapse *into* a surviving event rather than into a gap, the delivered
range stays contiguous. There is no sparse-coverage model, no
`skippedSeqRanges` wire concept, and no `malformedWindow` failure mode.

## Stub shape

One shape, produced by server hydration and client eviction alike:

```ts
interface ToolCallStub {
  toolCallId: string;
  toolName: string;
  argsSummary: string;      // bounded rendering, e.g. 'Read("src/a.ts")'
  status: "running" | "ok" | "error";
  startedAt: number;
  durationMs?: number;
  fullBytes: number;        // size of the payload NOT sent
  head?: string;            // first N bytes of result
  tail?: string;            // last N bytes of result
  detailLevel: "sliced" | "metadata";
}
```

`fullBytes` makes the UI honest: the row reports "2.3 MB not loaded" rather than
implying truncation is the whole story. A stub is self-describing — rendering it
never requires a sibling event.

Sizes: `sliced` retains up to 20 KB per logical call (10 KB head + 10 KB tail),
matching #101. `metadata` is roughly 200 bytes.

## Fetch protocol

The seq/id-addressable fetch #77 flagged as missing plumbing:

```ts
{ type: "fetch_tool_payload", sessionId, toolCallId, requestId }
→ { type: "tool_payload", requestId, toolCallId, payload | error }
```

Keyed by `toolCallId`, not seq: tool ids are stable across replay and eviction
and survive re-hydration, so the client need not track which seq a payload lived
at after the row degrades.

- **Bounded response.** The server caps the response independently. Above the
  cap it returns a larger slice plus `truncated: true`; the UI offers "open raw".
- **Not cached in the ledger.** Fetched payloads live in a short-lived map keyed
  by `toolCallId` under its own LRU. Re-inflating tools must not re-grow the hot
  ledger that eviction just shrank.
- **Idempotent and cancellable.** No ledger mutation, so a failed fetch degrades
  to an error affordance on one row and cannot corrupt the transcript.

## Budget algorithm

Inputs: contiguous ascending range, budget `B` (default 1.5 MiB), tool ceiling
fraction (default 0.25).

1. **Coalesce** per the rules above.
2. **Reserve.** `toolCeiling = floor(B × 0.25)` ≈ 384 KiB. The remainder is a
   chat floor that tool content cannot take.
3. **Walk back from the tail**, accounting `chatBytes` and `toolBytes`
   separately. For each tool call, admit at its current rung; if that would
   exceed `toolCeiling`, degrade it one rung and retry; if the ceiling is still
   exceeded, stop admitting tools and emit older ones as `EvictedToolBurst`
   markers. Degrade **oldest-first**, so recent calls keep the most detail.
4. **Chat boundary invariant** (#101 item 5). The window must contain at least
   one user or assistant chat event and must begin at a user-turn boundary. A
   tool-only suffix is invalid: walk further back to reach the nearest user turn
   start, degrading tools further to make room.
5. `hasMoreOlder` = admitted window start > source range start.

Worked example — #101's session, 12 logical calls: 12 × 20 KB = 240 KB, inside
the 384 KiB ceiling, leaving ~1.26 MiB for chat. A 500-call window degrades to
metadata (~100 KB) and still leaves the chat floor intact.

## Testing

**The property test that would have caught #102**, and the centerpiece of this
work:

> For any generated event sequence, the rendered row order and roles produced by
> reducing the *projected* events must equal those produced by reducing the
> *raw* events. Only tool payload content may differ.

Generated sessions must cover: text before/between/after tool calls; multiple
tools per turn; turns with and without `message_end`; thinking blocks;
interleaved subagent bursts; aborted turns.

Supporting tests:

- **Budget sweep.** At budgets from 1.5 MiB down to 16 KiB, assert the chat
  floor is honored, the window is contiguous, the chat-boundary invariant holds,
  and `hasMoreOlder` is accurate.
- **Ladder round-trip.** Each rung re-inflates to the correct payload; fetched
  payloads do not enter the ledger.
- **Anchoring.** A tool call spanning concurrent assistant text keeps its
  transcript position.
- **Determinism.** Same range + same budget ⇒ byte-identical projection.
- **Golden session.** A captured real session, asserted end to end.

## Non-goals

- No change to live streaming. Live events do not pass through the projection.
- No summarization or deletion of raw JSONL.
- No change to model-context compaction.

## Migration

The projection is server-side and stateless, so there is no persisted format to
migrate. The client cache version bumps to invalidate entries written by #102;
those entries are simply discarded, and the affected sessions re-hydrate.
