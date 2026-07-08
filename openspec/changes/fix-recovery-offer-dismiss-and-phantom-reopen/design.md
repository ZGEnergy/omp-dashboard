## Context

Cold-start recovery (`shutdown-session-recovery`) offers to reopen pi sessions that were running when the host died. It has three modes via `reopenSessionsAfterShutdown` (`ask` default, `auto`, `off`). Two faults exist in `ask` mode today:

1. **Dismiss (×) does not stick.** The server holds `pendingRecoveryOffer` for the entire process lifetime and replays it on every `onConnect` (`server.ts:726`). The client's `clearRecoveryOffer()` only nulls an in-memory bus — it sends nothing to the server and touches nothing durable. Any WS reconnect (drop, reload, server switch) resurrects the popup. Even a full server restart re-offers, because the on-disk liveness markers (`.meta.json live:true`) are never consumed.

2. **Candidates look pre-reopened.** In `ask` mode candidates are EXEMPT from the cold-start force-`ended` normalization (`server.ts:298-306`), so they sit in the session list in a non-`ended` state before the user clicks anything.

Reopening a pi session `continue`s a real agent (spends tokens, may re-run tool calls, costs money), so a false/forced reopen is not free. Reference model: Chrome's "Restore pages?" — crashed tabs stay CLOSED, a dismissible bubble offers restore, restore happens ONLY on click, and dismissing consumes the crash sentinel so it never re-offers.

## Goals / Non-Goals

**Goals:**
- Dismiss is durable and final: it consumes the on-disk liveness marker for the offered sessions and clears the server-held offer. Never re-offered, even after a full restart.
- The offer shows once per dirty boot: after reopen OR dismiss, no reconnect replays it.
- Nothing looks reopened until the user clicks Reopen: `ask`-mode candidates are normalized to `ended` on cold start, same as `off`.
- Reopen remains the ONLY path that resumes a candidate in `ask` mode, via the existing resume flow.

**Non-Goals:**
- Changing `auto` (silent resume, no notification) or `off` (normalize, no prompt) behavior. Both already correct.
- Removing or collapsing the three-mode setting. `auto` is the notification-free path by design; keeping `off` gives power users a no-prompt-ever option.
- Per-session pick-and-choose within the offer (reopen-all / dismiss-all only, unchanged).
- Any config migration or new setting.

## Decisions

### D1 — Dismiss consumes the liveness marker server-side (Chrome sentinel model)
Introduce a client→server `recovery_dismiss { sessionIds: string[] }` message. On receipt the server: (a) sets `pendingRecoveryOffer = null` so `onConnect` stops replaying, and (b) for each id calls `metaPersistence.setLiveness(sessionFile, { live: false })` and flushes, so `isRecoveryCandidate` returns false forever after. This mirrors Chrome consuming its crash sentinel on dismiss.
**Alternative rejected:** client-only persistence (localStorage of dismissed ids). Rejected — the on-disk marker still says `live:true`, so a second device or a fresh browser re-offers; the marker is the single source of truth and must be the thing consumed.

### D2 — Drop the `ask`-mode normalization exemption
Remove the exemption at `server.ts:298-306`; in `ask` mode candidates are normalized to `ended` exactly like `off`, and pushed into the offer with just the metadata needed to resume (`sessionFile`, `cwd`, `name`, `model`, `liveEpoch`). Reopen re-hydrates via the existing resume flow (`handleResumeSession` / `spawnPiSession` with `mode:"continue"`), which does not depend on the pre-reopen non-`ended` status.
**Alternative rejected:** keep the exemption but hide candidates in the UI. Rejected — leaves zombie non-`ended` state that other code paths (sorting, counts, reattach) must special-case; normalizing is simpler and matches `off`.

### D3 — Clear `pendingRecoveryOffer` on any resolving action
Both reopen (resume) and dismiss null the server-held offer. Reopen already clears the client bus; add the server-side clear on the resume path and on `recovery_dismiss`. `onConnect` replay is thus bounded to "before first resolution".
**Alternative rejected:** TTL on the pending offer. Rejected — a timer can drop an offer the user hasn't seen yet (multi-device / delayed connect); resolution-driven clearing is deterministic.

### D4 — Keep three modes; confirm `auto` is notification-free
No mode changes. `ask` → one dismissible offer (fixed per above). `auto` → silent resume, NO offer broadcast (already true at `server.ts:1963`). `off` → normalize, no prompt. Default stays `ask` because reopening a pi agent has real cost (Word-recovery-like), warranting a confirm; power users opt into `auto` once for zero friction (Chrome's "continue where you left off").

## Risks / Trade-offs

- **[Consuming the marker on dismiss is irreversible]** → Intended and matches Chrome. The session `.jsonl` is untouched; the user can still open it manually from the session list. Only the *auto-offer* is retired.
- **[Multi-device: one device dismisses, another has the offer rendered]** → `pendingRecoveryOffer=null` + marker clear means the second device won't get a replay on its next reconnect; a still-mounted stale card is cosmetic and clears on its next resume/dismiss. Acceptable — matches existing "shown once per dirty boot" intent.
- **[Dropping the exemption could break code that read the non-`ended` candidate status]** → Audit shows only the offer path consumed it; the resume flow re-hydrates independently. Covered by updating `recovery-*` tests + `cold-start-recovery-exempt.test.ts`.
- **[Race: dismiss arrives while an auto/reopen resume is in flight]** → Dedup via existing `pendingResumeIntents` (last-write-wins); dismiss clearing the marker after a resume started is harmless (resume already holds its intent).
