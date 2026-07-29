# Proposal — fork-content-predicate

## Why

`sessionHasForkableContent` (shipped in PR #110 for issue #107) is **inert on
every real session**. Issue #107's symptom — forking a content-rich session
whose `.jsonl` pi rotated away silently opens a blank chat — therefore
persists. Two independent causes, both confirmed against the live instance:

1. `packages/extension/src/bridge-context.ts` `extractFirstMessage` tests
   `entry.role`, but `SessionManager.getEntries()` returns pi `SessionEntry`
   **envelopes** — `{ type: "message", message: { role } }`. No `SessionEntry`
   variant has a top-level `role`, so the function returns `undefined` for
   every real session, always. `firstMessage` never reaches the
   `session_register` wire. Live: 0 of 4 alive sessions carry `firstMessage`;
   the 102 ended ones that do got it from the file-scan path
   (`session-scanner.ts`), which already reads the envelope correctly — as does
   `packages/shared/src/state-replay.ts`.
2. `packages/server/src/event-wiring.ts` resets `tokensIn`/`tokensOut`/
   `contextTokens` to `0`/`null` on **every** bridge registration, on the
   premise that "turn-end replay rebuilds these". `state-replay.ts` emits no
   `turn_end`, so nothing rebuilds them until a new turn completes.

Net: all four predicate markers are structurally empty on a reattached
session, so the preflight takes the degrade branch for exactly the sessions
#110 was written to protect.

The existing suite stayed green because it asserts the predicate against
hand-built literals (`sessionHasForkableContent({ tokensIn: 30_709 })`) and
because `session-switch.test.ts` re-implemented `extractFirstMessage` inline
and fed the copy a `{ role: "user" }` shape pi never produces.

## What Changes

1. **Repair `firstMessage` at source.** `extractFirstMessage` reads the pi
   entry envelope. Zero new plumbing, zero new state, preflight stays O(1).
   `firstMessage` is not in the reset list, is carried through `register()`,
   and is persisted by `sessionToMeta` — once set it survives reattach.
2. **Add a bridge-version-independent backstop.**
   `EventStore.hasConversationEvents(sessionId)` — true only on
   `message_update` / `message_end`, never on register-time plugin chatter —
   unioned into the predicate and threaded into BOTH preflights
   (`browser-handlers/session-action-handler.ts`, `session-api.ts` +
   `server.ts` wiring). Covers the window before every bridge is reloaded and
   sessions registered by an older bridge.
3. **Close the test gap.** A predicate over persisted state is now tested
   against state produced by the pipeline that populates it, never a literal.
   The inline `extractFirstMessage` copy is deleted.

## Degrade contract (must not regress)

A genuinely fresh, empty session must still degrade to a new session
(`FORK_DEGRADED_TO_NEW`) or forking one hangs ~30 s on the spawn-register
watchdog (change: fix-fork-empty-session-silent-timeout). A fresh session
already has `flow:list-flows` at seq=1, so `hasEvents()` is unusable — hence
the conversation-type filter.

## Out of scope

Recorded for follow-up, deliberately untouched:

- `.meta.json` zero-wipe: `event-wiring.ts` resets counters on reattach and
  `server.ts` `onChange` → `sessionToMeta` persists the zeros as a full
  overwrite. Durable data loss on every restart.
- `session-scanner.ts` enumerates `.jsonl` only, so a session with an orphaned
  `.meta.json` is never restored; it also overwrites good persisted stats with
  zeros re-extracted from a truncated/rotated `.jsonl`.
- `extractFirstAssistantReply` has the identical `entry.role` bug, silently
  degrading the auto-naming summarizer.

## Discipline Skills

`systematic-debugging`, `doubt-driven-review`
