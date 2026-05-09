## Why

The session card has accreted many independent feature areas (OpenSpec, workspace/jj, processes, memory, flows) that currently render as a flat sequence of rows separated only by tiny dividers. Visual hierarchy is weak: users cannot scan a card and immediately see "what region am I looking at." A subcard model with centered uppercase titles would group related controls, make each area's identity explicit, and let future sections plug in without crowding the existing layout.

- Reorganize `SessionCard.tsx` body into stacked **subcards**, each an inset translucent panel (50% alpha over card bg via `color-mix`, 1 px subtle border, rounded 8 px, ~6–8 px padding) with an **uppercase capsule legend title** overhanging the top border (fieldset-legend style).
- Initial subcards (in order): `OPENSPEC`, `WORKSPACE`, `PROCESS`, `MEMORY`, `FLOWS`.
- Keep the **header zone** (status icon, name, model, status text, progress bar, cost, fork, edit/timer/visibility/close icons) **outside** any subcard.
- Empty subcards SHALL be hidden, not rendered as empty panels.
- Selection accent, card background (`--bg-tertiary`), and pulse animations (`card-working-pulse`, `card-unread-pulse`) remain on the **outer card**, unchanged.
- **Drop redundant inline labels** (`OpenSpec:`, `Flows:`) inside subcards — the capsule legend title is the only label.
- **Drop the FLOWS internal divider** (`mt-1.5 pt-1.5 border-t`) inside `SessionFlowActions` — the subcard provides the grouping.
- **Replace the round status dot** with the **source icon** (TUI / Headless / tmux / Zed) colored by session status (green=active, yellow=streaming, red=error, amber=retrying, muted=ended). Source label remains discoverable as the icon's `title` tooltip.
- **Drop the dedicated drag-handle icon overlay** (`mdiDragHorizontalVariant`). The card's existing left gutter (status icon column) becomes the drag zone via a `DragHandleCtx` React context exposed by `SortableSessionCard`. Cursor: `grab` on hover, `grabbing` on press.
- **Tighten spacing** throughout: outer card padding `px-3 py-2.5` → `px-2 py-2`; gutter↔content gap `gap-2` → `gap-1.5`; gutter width `w-4` → `w-2`; inter-subcard margin `mt-3` → `mt-1.5`; subcard padding `px-3 py-2` → `px-2 py-1.5`.
- **Plugin slot taxonomy additions** to support per-subcard routing:
  - `session-card-memory` (multiplicity `many`, react-only) — reserved for memory-related plugin contributions; rendered inside the MEMORY subcard. No plugin claims it in this PR; honcho-plugin reroute is deferred to a separate change.
  - `workspace-action-bar` (multiplicity `many`, react-only) — contributions render inside the WORKSPACE subcard alongside `session-card-badge`.
- **Reroute jj-plugin claims**: `JjActionBar` + `JjInitAffordance` migrate from `session-card-action-bar` → `workspace-action-bar`. The generic `session-card-action-bar` slot remains defined as a card-footer escape hatch (currently unclaimed).
- **Out of scope here, tracked elsewhere**: the honcho-plugin manifest reroute (`HonchoBadge` / `HonchoCardActions` from `session-card-badge` / `session-card-action-bar` → `session-card-memory`) lives in `openspec/changes/honcho-dashboard-plugin/tasks.md §11`. Until that follow-up lands, the Honcho badge continues to render via the generic `session-card-badge` slot inside the WORKSPACE subcard, and the MEMORY subcard remains hidden (no claimers).
- **Folder header parallel redesign** (sidebar pinned-folder rows): apply the same gutter + drag-context pattern. The folder chevron sits at the top of a left gutter column; the empty space below the chevron is the drag zone (`SortablePinnedGroup` exposes `FolderDragHandleCtx`; `FolderDragGutter` consumes). All folder-header content (branch line, action bar, OpenSpec section) shifts to the content column — the previous `ml-5` / `ml-3` indents are removed. The dedicated drag-icon overlay (`mdiDragHorizontalVariant`) is removed.
- No behavioral change to any contained control — buttons, pills, dialogs, links, callbacks, and dnd-kit reorder semantics are preserved verbatim.

## Capabilities

### New Capabilities

- `session-card-subcards`: Vertical stack of titled inset panels grouping related session-card controls; defines subcard visual style (translucent panel + capsule legend title), ordering, empty-state hiding, status-icon-as-source-icon, and gutter-as-drag-handle.
- `sidebar-folder-header`: Pinned-folder header layout in `SessionList.tsx`; defines gutter + content two-column structure, chevron-only toggle, gutter-as-drag-handle, and removal of the legacy drag-icon overlay.

### Modified Capabilities

- `sleek-card-design`: The "thin horizontal divider + action row" requirement no longer applies to grouped sections (OpenSpec/Workspace/Process/Memory/Flows) which now sit inside subcards. The previously-required `bg-green-500` round status dot in the gutter is replaced by the source icon colored by status; the source-badge requirement (icon + tooltip) moves from the action row to the gutter.

## Impact

- **Code (client)**:
  - `packages/client/src/components/SessionCard.tsx` — subcard restructure, gutter as drag handle, source-icon-as-status replacement.
  - `packages/client/src/components/SessionSubcard.tsx` — new wrapper (capsule legend title, translucent panel, hides on empty children).
  - `packages/client/src/components/SortableSessionCard.tsx` — drag overlay removed; `DragHandleCtx` context exposed.
  - `packages/client/src/components/SortablePinnedGroup.tsx` — drag overlay removed; `FolderDragHandleCtx` context exposed.
  - `packages/client/src/components/SessionList.tsx` — folder header restructured into gutter + content columns; `FolderDragGutter` helper added; `ml-5` indents removed.
  - `packages/client/src/components/FolderOpenSpecSection.tsx` — internal `ml-5` indents removed (previously compensated for offset; no longer needed).
  - `packages/flows-plugin/src/client/SessionFlowActions.tsx` — internal `mt-1.5 pt-1.5 border-t` divider removed; inline `Flows:` label removed.
  - `packages/client/src/components/SessionOpenSpecActions.tsx` — three inline `OpenSpec:` labels removed.
- **Code (shared / runtime)**:
  - `packages/shared/src/dashboard-plugin/slot-types.ts` — add `session-card-memory` and `workspace-action-bar` slots.
  - `packages/shared/src/dashboard-plugin/slot-props.ts` — typed prop contracts for the new slots.
  - `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` — add `SessionCardMemorySlot`, `WorkspaceActionBarSlot`, and `useSlotHasClaimsForSession` helper hook.
- **Plugin manifests**:
  - `packages/jj-plugin/package.json` — reroute `JjActionBar` + `JjInitAffordance` to `workspace-action-bar`.
  - `packages/honcho-plugin/package.json` — **NOT touched** in this PR. Reroute tracked in `openspec/changes/honcho-dashboard-plugin/tasks.md §11`.
- **Tests**: `SessionCard.test.tsx`, `SessionSubcard.test.tsx`, `session-drag-reorder.test.tsx`, `jj-plugin/src/__tests__/manifest.test.ts` — updated for new structure, new testids (`session-status-icon`), new slot ids, and new query selectors (`text-*` instead of `bg-*` for status).
- **Visuals**: Cards visibly tighter horizontally (~14 px reclaimed) and vertically; subcard panels translucent; status now communicated via colored source icon; folder header padding tightened.
- **Out of scope**: Server, bridge, protocol, persistence — none touched. No behavior change to any control.
