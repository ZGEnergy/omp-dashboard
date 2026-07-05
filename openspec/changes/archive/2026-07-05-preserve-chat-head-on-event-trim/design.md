# Design

## Context

`memory-event-store.ts` bounds per-session memory with `maxEventsPerSession`.
The old trim (`splice(0, excess)`) removed the oldest events unconditionally.
That is wrong for chat display because the client rebuilds the transcript from a
full replay, so dropping the oldest events erases the start of the conversation.
Subagent turns make this routine: every subagent lifecycle + inner tool event is
forwarded into the *parent* session buffer, so a single turn can emit thousands
of events.

## Decisions

### D1 — Essential-aware trim, not oldest-first

Protected set = { `message_start`, `message_end` }. These two are sufficient for
the client to rebuild a completed message's text: the finalized content lands at
`message_end`, and intermediate `message_update` deltas only matter for the
still-streaming tail (which is the newest events and never trimmed). Everything
else (tool_execution_*, subagent_*, flow_*, reasoning, stats, streaming deltas)
is trimmable. Degradation under pressure is "old tool cards lose detail," never
"the conversation head vanishes."

Fallback: when essentials *alone* exceed the cap, drop the oldest essentials to
hold the memory bound. At the 20000 cap this needs ~10000 messages in one
session — not reachable in practice; the fallback only exists so the bound is
never violated.

### D2 — Hysteresis to keep trim amortized O(1)

Trimming on every over-cap insert makes each insert O(n) (scan + splice), and
the history-load path inserts every replayed event in a loop → O(events × cap)
cold load. Instead, allow the buffer to overshoot by `TRIM_SLACK`, then reclaim
to the cap in one O(n) pass:

```
trimSlack = min(256, floor(maxEventsPerSession * 0.05))
if (length > cap + trimSlack) trimBufferToLimit(buf, cap)  // one O(n) pass
```

Amortized cost = O(n / slack) ≈ O(1) per insert. `trimSlack` scales to 0 for the
tiny caps used in unit tests (so they trim at exactly the cap and assertions stay
deterministic) and to 256 for the 20000 production cap (~1 reclaim per 256
inserts). Memory overshoot is bounded by `trimSlack` events.

### D3 — Raise the default cap 5000 → 20000

Independent of D1/D2: with 20000, normal subagent turns never trim at all, so
the essential-preservation logic is a safety net rather than a routine path.

## Risks

- Buffer temporarily holds up to `cap + slack` events — negligible (≤256 extra).
- Seq gaps after trimming scattered non-essential events — already tolerated;
  `getEvents` filters by seq and the client handles non-contiguous seq.
