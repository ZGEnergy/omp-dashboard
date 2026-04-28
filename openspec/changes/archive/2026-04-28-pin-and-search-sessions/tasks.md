## 0. Verification protocol

This change used **manual UI gates** between segments. After each segment, the implementer ran `./scripts/build.sh` + `curl -X POST http://localhost:8000/api/restart`, then waited for user verification before advancing. The four gates (4.4, 7.6, 8.8, 9.4) all passed manual verification, with substantial design revisions captured in the iteration log below.

## 1. Sidebar two-input search

- [x] 1.1 Add `Folder…` filter input to the sidebar header (case-insensitive substring match against folder `cwd`)
- [x] 1.2 Add `Session…` search input to the sidebar header (case-insensitive substring match against display name)
- [x] 1.3 Compose with AND-logic: both empty → show all default folders; folder typed → narrow folder set; session typed → narrow sessions inside visible folders
- [x] 1.4 When session-search is non-empty AND folder-filter is empty, restrict the search to pinned folders only
- [x] 1.5 Auto-expand all visible folders while either input is non-empty
- [x] 1.6 Display-name-aware match: fall through `name` → `firstMessage` → `cwd` basename, mirroring `getSessionDisplayName`
- [x] 1.7 Empty-state "No sessions match your search" inside folders with zero matches when search is active
- [x] 1.8 Pure helper `filterByQuery` in `packages/client/src/lib/session-grouping.ts` covering the fallback chain

## 2. Per-folder collapsible ended-sessions group

- [x] 2.1 Render ended sessions in a group below alive sessions inside each folder
- [x] 2.2 Bottom `N ended` toggle row collapses/expands the group; default state is collapsed
- [x] 2.3 When expanded, render a second `Hide ended` toggle at the top of the ended group
- [x] 2.4 Both top and bottom toggles collapse the group when clicked
- [x] 2.5 Auto-expand the ended group when either filter input is non-empty
- [x] 2.6 Hide the bottom toggle while a filter is active (no manual collapse during filtered view)

## 3. Drag-reorder restricted to alive sessions

- [x] 3.1 Server-side: `sessionManager.onChange` hook in `server.ts` detects alive→ended transitions via a `Set<sessionId>` tracking last-known-ended state
- [x] 3.2 On transition, prune the id from `sessionOrder` for that cwd via `sessionOrderManager.remove`
- [x] 3.3 Snapshot order before/after; broadcast `sessions_reordered` to all browsers exactly once per real change
- [x] 3.4 Subsequent `update()` calls on already-ended sessions do NOT re-trigger the prune (avoids click-induced jumps)
- [x] 3.5 Client-side: read `sessionOrder` verbatim in folder render; no client-side filter for ended ids (so drag-to-resume can preserve dropped position)

## 4. Drag-to-resume

- [x] 4.1 Extend `handleDragEnd` in `SessionList.tsx`: if the dragged session is ended AND the drop target is alive (same folder), dispatch `resume_session` in `continue` mode
- [x] 4.2 The drag also triggers the standard `reorder_sessions` flow, so the dropped position persists
- [x] 4.3 Drop ended onto ended → plain reorder, no resume
- [x] 4.4 Drop alive onto alive → plain reorder, no resume

## 5. Default-view rules for unpinned folders

- [x] 5.1 Pinned folders always appear
- [x] 5.2 Unpinned folders appear only when (a) they contain at least one alive session OR (b) the folder filter is non-empty
- [x] 5.3 Unpinned-only-ended folders stay hidden by default

## 6. Single visibility toggle (`Show hidden`)

- [x] 6.1 Remove the `Active only` toggle from the sidebar header
- [x] 6.2 Drop `getActiveOnly`/`persistActiveOnly` wiring in `SessionList.tsx`
- [x] 6.3 `Show hidden` remains as the only filter chip

## 7. Cleanup

- [x] 7.1 Remove all GATE references and per-iteration commentary from code comments
- [x] 7.2 Remove all per-session pin code (`pin_session` / `unpin_session` / etc.) — initially scaffolded across §1–§7 of the original task plan but scrapped during iteration
- [x] 7.3 Type-check passes (`./scripts/build.sh --check-only`)
- [x] 7.4 Build passes end-to-end

## 8. Verification gates passed

- [x] 8.1 GATE — backend wiring verified
- [x] 8.2 GATE — search behavior verified across the design revisions
- [x] 8.3 GATE — drag-to-resume verified with dropped-position preservation
- [x] 8.4 GATE — full feature exercise: pin folder + search + ended group + drag-to-resume + restart cycles all behave as specified

## 9. Iteration log (retrospective)

The original proposal scaffolded a much larger surface that was scrapped during user-driven verification:

- **Per-session pinning** (`pin_session`/`unpin_session`/`reorder_pinned_sessions` messages, `pinnedSessions` preferences key, pinned-session auto-resume on startup, `partitionPinnedFirst` helper, pin button on every session card): scrapped once the per-folder collapsible ended-session group landed. The collapsible group made per-session pinning redundant — ended work is reachable in one click without a separate "pin this session" affordance.
- **Per-folder search inputs** (one search box per folder body): scrapped in favour of the sidebar-level two-input layout when the user pointed out that folder bodies don't carry search boxes well visually.
- **Search bypasses both `activeOnly` and `showHidden`** (original D1): rejected when verification showed it created confusing inconsistency between toggle state and visible results.
- **Universal active-first ranking** (replacement for `Active only` removal): rejected when the user pointed out it broke the existing drag-reorder feature for alive sessions. Replaced with the server-side `sessionOrder` prune (only ended ids are dropped; alive drag-reorder persists).

The shipped design captures only what survived verification.

## 10. Documentation

- [~] AGENTS.md / docs/architecture.md / README.md updates deferred to a follow-up. The behaviour is captured in the archived spec deltas.
