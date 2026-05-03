## Context

Browser client holds two pieces of session state for the sidebar:
- `sessions: Map<string, DashboardSession>` (in `App.tsx`, fed by `session_added`/`session_updated`/`session_removed` messages).
- `sessionOrderMap: Map<string, string[]>` (cwd → ordered ids, fed by `sessions_reordered`).

On WebSocket reconnect (`App.tsx:344-352`), only `sessionOrderMap`, `subscribedRef`, and `terminals` are reset. The `sessions` Map persists from the previous server lifetime.

On browser connect, `browser-gateway.ts:212-230` emits one `session_added` per session and one `sessions_reordered` per non-empty cwd order. These are merged on the client. There is no atomic "this is the canonical state, drop the rest" message. Stale sessions (e.g. ones the new server no longer knows about, or transient mid-bridge-reattach state) survive reconnect.

`SessionList.tsx` renders alive then ended (`[...activeSessions, ...endedSessions]`) and inserts a "Show N ended" divider. `firstEndedIdx` is computed against `allIds`, which is `[orderedIds, ...tail]` where `tail = sessionIds not in ordered`. If a session lands in the tail with status `"active"` and an ended id sits earlier in `allIds`, the alive card visually appears below the divider.

## Goals / Non-Goals

**Goals:**
- Eliminate stale sessions on the browser after server restart without requiring a full page refresh.
- Single, atomic snapshot send on connect — server is the source of truth.
- Keep incremental updates (`session_added`, `session_updated`, `session_removed`, `sessions_reordered`) for live changes.

**Non-Goals:**
- Negotiate protocol versions between client and server.
- Persist or version the snapshot — it is a transient on-connect message.
- Re-sync `terminals`, `editorStatuses`, `pinnedDirectories`, `openspecMap`, etc. (out of scope; keep their existing on-connect flows).
- Solve potential races during *live* operation (e.g. reattach-policy ordering). The fix targets the connect/reconnect transition only.

## Decisions

### D1. New protocol message `sessions_snapshot` instead of mutating existing messages
- **Choice:** add `SessionsSnapshotMessage` carrying both the full session list and all non-empty `sessionOrder` entries.
- **Rationale:** keeps incremental messages narrow (each does one job). The snapshot becomes a single, idempotent "replace state" event.
- **Alternatives considered:**
  - *Repurpose `session_added`* with a `replaceAll: true` flag — pollutes a per-session message with batch semantics.
  - *Send `sessions_reordered` with status hints* — couples ordering and registry; client would still need to drop unmentioned sessions.

### D2. Client REPLACES, never merges
- **Choice:** in `useMessageHandler`, `case "sessions_snapshot"` does `setSessions(new Map(payload.sessions.map(s => [s.id, s])))` and `setSessionOrderMap(new Map(Object.entries(payload.orders)))`.
- **Rationale:** atomic replacement is the only way to drop stale ids. Per-id merging cannot detect "this id no longer exists on the server".
- **Alternatives considered:**
  - *Diff snapshot vs. local Map and emit removes* — client-side complexity, error-prone.

### D3. Server emits snapshot exactly once per browser connect, before any other session-related send
- **Choice:** in `browser-gateway.ts`'s `wss.on("connection")` handler, replace the existing per-session `session_added` loop and per-cwd `sessions_reordered` loop with one `sessions_snapshot` message.
- **Rationale:** preserves ordering invariant — client gets a complete picture before any incremental update could arrive for that connection. Other on-connect sends (`pinned_dirs_updated`, `openspec_update`, `terminal_added`) remain unchanged and out of scope.

### D4. Break old browser tabs cleanly; no fallback path
- **Choice:** server stops emitting the legacy on-connect `session_added`/`sessions_reordered` loop. Old clients see no sessions until refreshed.
- **Rationale:** user explicitly opted for clean break (see proposal). Fallback would double on-connect bandwidth and add a code path to maintain.
- **Alternative considered:** capability flag in `subscribe`. Rejected as over-engineered for a release where browser and server ship together.

### D5. Reconnect handler in `App.tsx` no longer pre-resets `sessionOrderMap`
- **Choice:** remove `setSessionOrderMap(new Map())` from the reconnect effect. The snapshot will replace it.
- **Rationale:** avoids a brief empty-state flicker between reset and snapshot arrival. `subscribedRef.current.clear()` and `setTerminals(new Map())` remain (terminals out of scope; subscribedRef is not state-driven UI).

## Risks / Trade-offs

- **[Snapshot size on first connect]** → Bandwidth bump (one large message instead of N small ones). Mitigation: snapshots are small in practice (sessions are JSON dicts, < ~5 KB each, typical < 50 sessions). Acceptable.
- **[Old browser tabs blank]** → Tabs from before the protocol change show no sessions until refreshed. Mitigation: documented break; release notes call it out.
- **[Race: snapshot vs. concurrent live update]** → If a `session_added` for a brand-new session arrives before the snapshot is fully processed, the new session could be overwritten by the snapshot's REPLACE. Mitigation: server emits snapshot synchronously before any other broadcast on that connection; client processes WS messages in order. Order is guaranteed by single-WS FIFO.
- **[Live updates mutating sessionOrderMap during snapshot serialization]** → If `sessionManager`/`sessionOrderManager` is mutated between snapshot construction and transmission (different ticks), snapshot could be slightly stale. Mitigation: build snapshot synchronously in one tick from the same in-memory stores the live broadcasts read from; subsequent live broadcasts re-converge.

## Migration Plan

1. Land protocol type, server change, client handler in one PR.
2. Release notes call out: "After upgrading the server, refresh open browser tabs."
3. No DB / persistence migration. No bridge-protocol change.

## Open Questions

None. Plan and scope confirmed with user before this artifact was written.
