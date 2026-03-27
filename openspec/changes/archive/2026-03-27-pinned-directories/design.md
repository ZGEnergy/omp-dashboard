## Context

The sidebar groups sessions by `cwd`. Groups sort by most recent session activity and vanish when filtered. An unused Workspace system exists server-side (`workspace-store.ts`, REST endpoints, `Workspace` type, `workspaceId` on sessions) with orphaned client components (`WorkspaceBar.tsx`, `AddWorkspaceDialog.tsx`). We replace this dead code with a simpler pinned directories feature.

## Goals / Non-Goals

**Goals:**
- Pinned directories always visible at top of sidebar, even with zero sessions
- User-defined ordering of pinned directories via drag-and-drop
- Pin/unpin from directory group headers
- Manual pin dialog for directories with no running sessions
- Remove all workspace-related code

**Non-Goals:**
- Named directories (pinned dirs use the cwd path, display the basename — no custom names)
- Workspace filtering/tagging — pinning is purely about visibility and ordering
- Directory discovery/scanning — user explicitly pins paths

## Decisions

### 1. Store pinned dirs as ordered array in `state.json`

Add `pinnedDirectories: string[]` to the existing `StateData` in `state-store.ts`. Array position = display order. No separate file, no IDs, no names.

**Why over separate file**: Pinned dirs are user preferences like hidden sessions and session order — same category, same store. Keeps the persistence model simple.

**Why over workspace model**: Workspaces had IDs, names, sortOrder integers, discovery, and a dedicated JSON file. All unnecessary for "pin this path to the top."

### 2. REST endpoints for pin operations

```
POST   /api/pinned-dirs          { path: string }           → pin (append)
DELETE /api/pinned-dirs           { path: string }           → unpin
PUT    /api/pinned-dirs/reorder   { paths: string[] }        → reorder
GET    /api/pinned-dirs                                      → list
```

**Why REST over WebSocket-only**: Matches existing patterns (hidden sessions use REST-like WebSocket messages, session order uses WebSocket). Actually — looking at the codebase, reorder and hide/unhide both use WebSocket messages. So:

Revised: Use **WebSocket messages** for pin/unpin/reorder (consistent with `reorder_sessions`, `hide_session`, `unhide_session` patterns). Add a REST `GET /api/pinned-dirs` for initial load on connect.

### 3. WebSocket protocol additions

**Browser → Server:**
- `pin_directory { path: string }` — pin a directory, appends to end
- `unpin_directory { path: string }` — unpin a directory
- `reorder_pinned_dirs { paths: string[] }` — set full order

**Server → Browser (broadcast):**
- `pinned_dirs_updated { paths: string[] }` — full list after any change

### 4. Client-side directory-level drag-and-drop

Use `@dnd-kit` (already a dependency) with a separate `DndContext` for pinned directory groups. Session-level DnD already exists within groups — these are independent drag contexts (directory-level vs session-level).

### 5. Sidebar layout: pinned section + unpinned section

```
┌─ Pinned (draggable) ──────────────┐
│ 📌 dir-a (2)              [unpin] │
│ 📌 dir-b (0)              [unpin] │
└────────────────────────────────────┘
┌─ Unpinned (auto-sorted) ──────────┐
│ 📁 dir-c (1)                [pin] │
│ 📁 dir-d (1)                [pin] │
└────────────────────────────────────┘
```

No visible section headers needed — the 📌 icon on pinned groups vs 📁 on unpinned is sufficient visual distinction. A subtle separator line between sections if both exist.

### 6. Workspace removal scope

Delete or modify these files:
- **Delete**: `src/server/workspace-store.ts`, `src/client/components/WorkspaceBar.tsx`, `src/client/components/AddWorkspaceDialog.tsx`
- **Modify**: `src/shared/types.ts` (remove `Workspace`, remove `workspaceId` from `DashboardSession`), `src/shared/browser-protocol.ts` (remove `WorkspaceUpdatedMessage`, remove `Workspace` import), `src/shared/rest-api.ts` (remove workspace references), `src/server/server.ts` (remove workspace endpoints, remove workspace store usage), `src/server/memory-session-manager.ts` (remove workspace matching)

## Risks / Trade-offs

- **[Risk] Pinning a path that later moves** → No mitigation needed. If the path no longer matches any session's cwd, the pinned group just shows "(0 sessions)". User can unpin it.
- **[Risk] Nested DnD contexts (directory drag + session drag)** → `@dnd-kit` supports this. Directory drag only in pinned section; session drag within any group. Separate `DndContext` wrappers.
- **[Risk] Breaking change removing workspaceId** → Low risk since it's unused client-side. Server sets it but nothing reads it. `workspaces.json` file can be left on disk (no migration needed, just ignored).
