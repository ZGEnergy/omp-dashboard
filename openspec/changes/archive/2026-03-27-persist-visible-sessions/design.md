## Context

The dashboard server uses a pure in-memory `Map<string, DashboardSession>` in `memory-session-manager.ts`. Active sessions recover when their bridge reconnects, but ended sessions are lost on server restart. The `state-store.ts` already persists hidden session IDs using the `json-store.ts` atomic write pattern.

## Goals / Non-Goals

**Goals:**
- Visible (non-hidden) session metadata survives server restarts
- Restored sessions are usable: shown in sidebar, chat loads on-demand when clicked
- Minimal code change — reuse existing patterns (`json-store.ts`, debounced writes)

**Non-Goals:**
- Persisting event/chat data (on-demand replay via bridge already handles this)
- Auto-hiding or auto-expiring old sessions
- Changing any WebSocket protocol messages

## Decisions

### 1. New `session-persistence.ts` module using JSON file

**Decision:** Create a standalone `src/server/session-persistence.ts` that saves/loads an array of `DashboardSession` objects to `~/.pi/dashboard/sessions.json`.

**Rationale:** Keeps `memory-session-manager.ts` focused on in-memory operations. The persistence layer is a separate concern that wraps the existing `json-store.ts` helpers. Same pattern as `state-store.ts` and `workspace-store.ts`.

**Alternative considered:** Extending `memory-session-manager.ts` directly — rejected because it mixes concerns and makes the session manager harder to test.

### 2. Debounced writes (same pattern as state-store)

**Decision:** Use debounced writes (1s) to avoid excessive disk I/O when multiple sessions update rapidly. Flush on server shutdown.

**Rationale:** Matches the existing `state-store.ts` pattern. Session metadata changes frequently (token counts, status), so debouncing is essential.

### 3. Restored sessions marked `dataUnavailable: true`

**Decision:** On startup, load persisted sessions into the session manager with `dataUnavailable: true`. When the browser subscribes, the existing on-demand load mechanism kicks in.

**Rationale:** Events are not persisted — only metadata. The existing `subscribe` handler in `browser-gateway.ts` already handles the `dataUnavailable` flow (tries bridge load, falls back to showing "unavailable").

### 4. Hidden sessions excluded from persistence

**Decision:** Only persist sessions where `hidden !== true`. When a session is hidden, remove it from the persisted file on the next save cycle.

**Rationale:** Hidden sessions are "dismissed" by the user. No need to restore them. This also keeps `sessions.json` small.

### 5. Integration point: `server.ts` wires persistence to session manager

**Decision:** In `server.ts`, after creating the session manager, load persisted sessions and register them. Hook into session updates to trigger saves.

**Rationale:** `server.ts` is already the composition root where all components are wired together.

## Risks / Trade-offs

- **[Stale data]** → Sessions persisted with `status: "active"` may actually be dead after restart. Mitigation: mark all restored sessions as `dataUnavailable: true`; they become fully available only if a bridge reconnects.
- **[File growth]** → Users who never hide sessions accumulate entries. Mitigation: acceptable for now; sessions.json will be small (each entry ~500 bytes). Users manage visibility manually.
- **[Race condition on save]** → Multiple rapid updates could interleave. Mitigation: debounced writes + atomic rename (existing `writeJsonFile` pattern).
