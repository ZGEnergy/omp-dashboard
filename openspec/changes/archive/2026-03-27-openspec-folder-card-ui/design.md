## Context

The current OpenSpec UI is session-centric: `OpenSpecSection` lives inside `SessionCard` and renders when the card is selected. It receives `openspecData` keyed by `sessionId` from `App.tsx → openspecMap`. Each session card has its own Attach/Detach/action buttons and the full change list.

After `server-side-directory-services`, OpenSpec data will be keyed by `cwd` instead of `sessionId`. This change restructures the UI to match: the change list moves to the folder group header, and session cards get a simpler attach/action UI.

Key existing components:
- `OpenSpecSection` (`src/client/components/OpenSpecSection.tsx`) — full section with change list, actions, attach/detach, new change button
- `SessionCard` (`src/client/components/SessionCard.tsx`) — renders `OpenSpecSection` in accordion when selected
- `SessionList` (`src/client/components/SessionList.tsx`) — `renderGroup()` renders folder headers with git info, editors, spawn button
- `OpenSpecActivityBadge` (`src/client/components/OpenSpecActivityBadge.tsx`) — phase badge on session card (unchanged)

## Goals / Non-Goals

**Goals:**
- Move change list + artifact status to folder group header
- Folder-level actions: Refresh, Bulk Archive (no agent needed)
- Session-level: attach combo box, LLM action buttons when attached, detach
- Consume per-directory OpenSpec data (`Map<cwd, OpenSpecData>`)

**Non-Goals:**
- "New Spec" spawn button (separate change: `new-spec-spawn`)
- Server-side data changes (handled by `server-side-directory-services`)
- Changing activity detection or auto-attach logic

## Decisions

### 1. Split `OpenSpecSection` into two components

**`FolderOpenSpecSection`** — rendered in folder group header (`renderGroup()` in `SessionList`):
- Collapsible change list (same collapsed-by-default behavior as today)
- Artifact letters, task counts per change
- Refresh button (sends `openspec_refresh { cwd }`)
- Bulk Archive button with confirmation dialog (server runs CLI directly — no session needed)
- Placeholder for "New Spec" button (added by `new-spec-spawn` change)

**`SessionOpenSpecActions`** — rendered in `SessionCard`:
- Attach combo box (dropdown of available changes from folder-level data, filtered to unattached or all)
- When attached: Detach button + LLM action buttons (Continue, FF, Apply, Archive, Explore)
- When not attached: just the combo box
- Activity badge stays as-is (`OpenSpecActivityBadge`)

**Alternative considered:** Keep a single component with conditional rendering based on context. Rejected — two distinct responsibilities (folder-level viewing vs session-level actions) map cleanly to two components. Simpler props, easier to test.

### 2. Attach combo box replaces per-change "Attach" button

Currently each change card in `OpenSpecSection` has an "Attach" button. With changes moving to the folder level, attaching is done from the session card via a `<select>` dropdown:

```
┌─ Session A ──────────────────────────────────┐
│  ...status info...                           │
│  📋 Attach: [▾ Select change...           ]  │  ← combo box
│                 add-dark-mode                │
│                 fix-auth                     │
│                 refactor-db                  │
└──────────────────────────────────────────────┘

┌─ Session B ──── 🏷️ add-dark-mode ───────────┐
│  ...status info...                           │
│  [Continue] [FF] [Apply] [Archive] [Detach]  │  ← action row
└──────────────────────────────────────────────┘
```

The combo box lists all changes from the folder's OpenSpec data. Selecting a change sends `attach_proposal`. The combo box is always visible when not attached (even when card is not selected) so users can quickly attach.

**Alternative considered:** Keep "Attach" buttons on the folder-level change cards. Rejected — attaching is per-session, so the action belongs on the session card. Having "Attach" on the folder card would require knowing which session to target.

### 3. LLM action buttons only shown when attached

Action buttons (Continue, FF, Apply, Archive, Explore) require sending a prompt to the session. They are only meaningful when a change is attached. They appear on the session card in a compact action row, visible without expanding the card.

When the session has an attached change but is `ended`, action buttons are hidden (can't send prompts to ended sessions).

### 4. Folder section placement in `renderGroup()`

The `FolderOpenSpecSection` renders after git info and before the editor/spawn buttons in the folder header:

```
📁 /project/foo (3)
  🔀 main → origin/main
  ▶ OpenSpec (3 changes) [🔄] [Bulk Archive]    ← NEW
  [VS Code] [+ New]
  ┌─ Session A ─────┐
  └──────────────────┘
```

This keeps it visually grouped with other folder-level metadata.

### 5. `openspecMap` key change in `App.tsx`

`openspecMap` changes from `Map<sessionId, OpenSpecData>` to `Map<cwd, OpenSpecData>` (already done by `server-side-directory-services`). `SessionList` receives it and:
- Passes per-cwd data to `FolderOpenSpecSection` in `renderGroup()`
- Passes per-cwd data to `SessionCard` (so the combo box knows available changes)

`SessionCard` no longer receives the full `OpenSpecData` for rendering the change list — it only needs the list of change names for the combo box dropdown.

### 6. Bulk Archive runs server-side CLI

The "Bulk Archive" button on the folder card sends a new browser→server message `openspec_bulk_archive { cwd }`. The server runs `openspec archive --completed` (or equivalent) in that directory. This doesn't need a session/agent.

**Alternative considered:** Keep sending as `send_prompt` to a session. Rejected — the whole point is folder-level actions shouldn't require a session. Also, bulk archive is a CLI operation, not an LLM task.

## Risks / Trade-offs

- **[Risk] Combo box UX with many changes**: If a directory has 15+ changes, the dropdown could be long. → **Mitigation**: Sort by status (in-progress first), show at most recent 10 with a "show all" option. Can be refined later.

- **[Trade-off] Action buttons always visible on session card**: Currently hidden in accordion. Making them always visible adds visual weight but improves discoverability and reduces clicks.

- **[Trade-off] Two-component split increases file count**: But each component is simpler and more focused. Net reduction in complexity per component.
