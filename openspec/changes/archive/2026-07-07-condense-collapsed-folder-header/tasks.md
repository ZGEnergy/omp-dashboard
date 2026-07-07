# Tasks

## 1. Status rollup helper (DRY)

- [x] 1.1 Add pure `countStatusRollup(sessions): { working, idle }` to `packages/client/src/lib/session-status-visuals.ts`, reusing `deriveStatusShape`. Count `working` (streaming/resuming) and `idle` (active/idle); exclude `needs-you` (owned by `FolderNeedsYouPill`) and `ended`.
- [x] 1.2 Unit test: mixed folder → `{ working, idle }` correct; ask_user excluded; ended excluded; empty folder → zeros.

## 2. FolderStatusRollup component

- [x] 2.1 New `packages/client/src/components/FolderStatusRollup.tsx` — renders working (`--status-working`) and idle (`--status-idle`) dot-counts; returns `null` when both are 0; `aria-label` summarises counts.
- [x] 2.2 Unit test: hidden when no working/idle; shows counts and excludes ended/needs-you; omits the working chip when zero.

## 3. Collapse-conditional header slots

- [x] 3.1 In `packages/client/src/components/SessionList.tsx`, wrap the header slot block (`GroupGitInfo` → `FolderActionBar` → `SidebarFolderSectionSlot` → `FolderOpenSpecSection` → `FolderSpawnButtons`) in `{!isCollapsed && (<>…</>)}`.
- [x] 3.2 Render `<FolderStatusRollup sessions={group.sessions} />` in the head row only when `isCollapsed`, after `FolderNeedsYouPill`.
- [x] 3.3 Verify the drag gutter (`FolderDragGutter`) and head row remain OUTSIDE/ABOVE the hidden block so drag-to-reorder survives while collapsed.

## 4. Test reconciliation

- [x] 4.1 Update the `SessionList` spec that assumed the spawn button is visible while collapsed: collapsed → spawn button absent; expand via `folder-toggle-btn` → button present → click spawns.

## 5. Validate

- [x] 5.1 `npx vitest run` client suite green (drag-reorder, workspace-drag-reorder, expanded-pinned-drag, SessionList, FolderStatusRollup, session-status-visuals).
- [x] 5.2 Biome clean on touched files; `tsc --noEmit` clean (pre-existing unrelated qa-fixture error only).
