## Why

OpenSpec changes are per-directory, not per-session. Currently the OpenSpec section lives on individual session cards, meaning the same data is shown redundantly across sessions in the same folder. Moving the OpenSpec section to the folder card header makes the data model match the UI model. Session cards keep only the attach badge and LLM action buttons (Continue, FF, Apply, Archive), while the folder card shows the full change list with agent-free actions (Refresh, Bulk Archive). Sessions without an attachment get a combo box to attach a change from the folder-level list.

Depends on: `server-side-directory-services` (provides per-directory OpenSpec data).

## What Changes

- OpenSpec section (change list, artifact letters, task counts) moves from `SessionCard` to the folder group header in `SessionList`.
- Folder-level actions: Refresh (re-polls server), Bulk Archive (server runs CLI), New Spec (spawns agent — see separate change).
- Session-level: attached change badge remains. LLM action buttons (Continue, FF, Apply, Archive, Explore) remain on session card, only visible when a change is attached.
- New attach combo box on session cards: dropdown lists available changes from the folder-level OpenSpec data. Replaces the current per-change "Attach" button.
- Detach button remains on session card.
- Activity badge (phase detection) remains on session card.

## Capabilities

### New Capabilities
- `openspec-folder-section`: Folder-level OpenSpec UI showing changes list, artifact status, and agent-free action buttons.
- `openspec-attach-combo`: Combo box dropdown on session cards for attaching/detaching changes, sourced from folder-level OpenSpec data.

### Modified Capabilities
- `openspec-card-section`: **BREAKING** — Removed from session card. Replaced by folder-level section and session-level attach/action buttons.
- `proposal-attachment`: Modified — attach is now via combo box instead of per-change "Attach" button.

## Impact

- **Client** (`src/client/`): `OpenSpecSection.tsx` refactored or split into `FolderOpenSpecSection` (folder card) and session-level attach/action UI. `SessionCard.tsx` simplified. `SessionList.tsx` renders OpenSpec in folder group header.
- **Shared** (`src/shared/`): `browser-protocol.ts` — OpenSpec data delivered per-directory, consumed by folder-level component.
- **No server changes** beyond what `server-side-directory-services` provides.
