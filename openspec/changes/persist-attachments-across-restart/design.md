## Context

When the dashboard server restarts, extensions re-register their sessions via `session_register`. The `register()` method in `memory-session-manager.ts` creates a brand new `DashboardSession` object, discarding any persisted fields like `attachedProposal`. The persisted data exists in `sessions.json` (written by `session-persistence.ts`) and is loaded on startup via `restore()`, but when the extension re-registers with the same session ID, the fresh object overwrites the restored one.

## Goals / Non-Goals

**Goals:**
- Preserve `attachedProposal` across server restarts when a session re-registers with the same ID
- Preserve user-set `name` (from rename or auto-name on attach) if the extension doesn't provide one

**Non-Goals:**
- Persisting event data (already handled by on-demand replay)
- Changing the extension registration protocol

## Decisions

### 1. Merge persisted fields in `register()`

**Decision**: In `register()`, check if a session with the same ID already exists in the map (from `restore()`). If so, carry over `attachedProposal` and `name` (when the new registration doesn't provide a name) from the existing session into the new one.

**Rationale**: This is the simplest approach — a few lines in `register()`. The `restore()` path already loads persisted sessions on startup, so by the time `register()` is called from the extension, the old data is available.

**Alternative considered**: Storing attachments in a separate persistence layer (like `state-store.ts`) — rejected as over-engineering. The session persistence already handles this data; we just need to not discard it.

### 2. Fields to preserve

**Decision**: Preserve these fields from the existing session when re-registering:
- `attachedProposal` — always preserve
- `name` — preserve only if the new registration doesn't provide one (empty/undefined)

**Rationale**: These are user-set fields that the extension doesn't know about. Other fields like `cwd`, `model`, `source` come fresh from the extension and should be updated.

## Risks / Trade-offs

- **Stale attachment**: If a session re-registers after the user detached a proposal in a previous server lifetime, the attachment would have been cleared. This is safe because `detach_proposal` sets `attachedProposal: null`, which gets persisted.
- **Session ID reuse**: Pi session IDs are unique per session file, so collision risk is negligible.
