# pin-and-search-sessions

## Why

Today the sidebar offers only a global "Active only" toggle and a "Show hidden" toggle that flip the entire list mode at once. Finding a specific past session by title requires flipping into a noisy view that exposes every ended/hidden session in every workspace, and ended sessions interleave with active ones via the persisted drag-reorder list, breaking the user's mental model of "current work first".

This change reorganises the sidebar around two primitives: a **two-input search** (folder filter + session search) at the top of the sidebar, and **per-folder ended-session collapsible groups** so ended work stays one click away without occupying default vertical space. Drag-reorder is restricted to alive sessions; dragging an ended card onto an alive one auto-resumes it. (Per-session pinning was originally proposed in this change but scrapped during iteration as redundant once the collapsible ended group landed.)

## What Changes

- **NEW: Two-input sidebar search** mounted in the sidebar header.
  - `Folder…` filter: case-insensitive substring match against folder `cwd`. Narrows the visible folder set; matching folders auto-expand.
  - `Session…` search: case-insensitive substring match against the same display string the user sees on the card (`name` → `firstMessage` → `cwd` basename, mirroring `getSessionDisplayName`). Narrows sessions inside visible folders.
  - Both inputs compose with AND-logic. When `Session…` is non-empty and `Folder…` is empty, only **pinned folders** are searched; typing into `Folder…` extends the search to matching unpinned folders.
- **NEW: Per-folder ended-sessions collapsible group.** Inside each folder, ended sessions render below alive sessions in a collapsible group. Default state is collapsed with a `N ended` toggle row at the bottom. When expanded, a second `Hide ended` toggle appears at the top of the ended group; both toggles collapse the group when clicked. Active filters auto-expand the group.
- **NEW: Drag-to-resume.** Dragging an ended session card onto an alive card in the same folder both reorders AND dispatches `resume_session` in `continue` mode. The dropped position is preserved through the resume round-trip.
- **NEW: Default-view rules for unpinned folders.** Pinned folders always appear. Unpinned folders appear only when (a) they contain at least one alive session, or (b) the user is filtering folders. This keeps the sidebar focused on workspaces the user is currently working in or has explicitly chosen to track.
- **MODIFIED:** `Active only` toggle removed. `Show hidden` remains as the only filter chip, controlling visibility of `hidden = true` sessions.
- **MODIFIED:** Server-side `sessionOrder` is pruned of ended session ids on the alive→ended transition (and the new order is broadcast). Subsequent updates on already-ended sessions do not re-trigger the prune. This guarantees ended sessions never interleave with active ones in the rendered list.
- **REMOVED:** Per-session pinning (`pin_session` / `unpin_session` / `reorder_pinned_sessions` / `pinned_sessions_updated` messages, `pinnedSessions` preferences key, pinned-session auto-resume on startup). All initially proposed in this change but scrapped during iteration once the collapsible-ended group made them redundant.

## Capabilities

### New Capabilities
- `session-search`: sidebar-level text-based filter over folder paths and session display names, with workspace-scoped composition rules

### Modified Capabilities
- `session-filtering`: replaces the prior `Active only` + `Show hidden` toggle pair with a single `Show hidden` toggle plus a per-folder collapsible ended-sessions group. Drag-reorder applies to alive sessions only; the server prunes ended ids from `sessionOrder` on transition. Drag-ended-onto-alive triggers auto-resume.
- `session-persistence`: pinned-session list lives in `preferences.json` (server-side, alongside pinned directories), not per-session `.meta.json` — pinning is a user preference, not session metadata

## Impact

- **Server**: `server.ts` adds an `onChange` hook that prunes ended session ids from `sessionOrder` and broadcasts `sessions_reordered` exactly once per alive→ended transition.
- **Client**: `SessionList.tsx` gets two sidebar-level inputs (`Folder…` / `Session…`), drops the `Active only` toggle, adds the per-folder collapsible ended-sessions group with top + bottom toggles, and extends the drag-end handler to dispatch `resume_session` when an ended card is dropped onto an alive one.
- **Pure helpers**: `session-grouping.ts` gains `filterByQuery` (display-name-aware substring match).
- **No breaking protocol changes**: no new WebSocket message types or REST routes. The `sessions_reordered` message is reused for the ended-prune broadcast.
- **No new dependencies**.
