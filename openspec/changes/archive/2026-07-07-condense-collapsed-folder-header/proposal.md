## Why

A collapsed folder group still renders every header slot — git branch bar, `FolderActionBar` (Terminals/Editor/Zed/⚙), plugin sections (Goals/Automation/KB), the `FolderOpenSpecSection` proposal-state row, and the elevated spawn buttons. Only the child session cards actually collapse. Two collapsed folders cost ~340px of vertical space for what is really one line of information: the folder name, how many sessions it holds, and whether any need attention. When many folders are collapsed the sidebar stays bloated, defeating the point of collapsing.

## What Changes

- When a folder group is **collapsed**, hide the heavy header slots: git branch bar, `FolderActionBar`, the `sidebar-folder-section` plugin slot, `FolderOpenSpecSection` (proposal state), and `FolderSpawnButtons`. They all reappear on expand — nothing is removed, only deferred.
- The collapsed header keeps **name + status only**: folder path/name, session count, the existing clickable `FolderNeedsYouPill` (purple attention), and a new compact working/idle status rollup (yellow/green dot-counts).
- The folder card **remains draggable while collapsed** — the drag gutter/handle lives above the hidden slot block, so drag-to-reorder is unaffected.
- **Behavioral reversal, flagged:** the elevated spawn buttons were previously "always visible regardless of collapse state" (change: `elevate-dashboard-add-buttons`). They are now hidden while collapsed, so spawning into a collapsed folder takes one extra click (expand first).

## Capabilities

### New Capabilities

_(none — this modifies an existing capability)_

### Modified Capabilities

- `collapsible-groups`: collapsing a folder now hides the header slots and shows only name + status (count, needs-you pill, working/idle rollup); the folder stays draggable while collapsed.

## Discipline Skills

- `doubt-driven-review` — this reverses a prior deliberate "always-visible spawn buttons" decision; the trade (density vs one-click spawn) is stress-tested before it stands.

## Impact

- **Code**: `packages/client/src/components/SessionList.tsx` — wrap the header slot block (`GroupGitInfo` → `FolderSpawnButtons`) in `{!isCollapsed && …}`; render the rollup in the head row when collapsed. New `packages/client/src/components/FolderStatusRollup.tsx`. New pure helper `countStatusRollup` in `packages/client/src/lib/session-status-visuals.ts`.
- **Tests**: new `FolderStatusRollup` + `countStatusRollup` specs; one existing `SessionList` spec updated (collapsed folders no longer show the spawn button — expand first).
- **UX**: collapsed folders are ~1 line instead of ~5. Needs-you and running/idle liveness remain visible at a glance. Spawning into a collapsed folder is one extra click.
