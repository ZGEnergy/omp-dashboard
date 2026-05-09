## 1. Wrapper component

- [x] 1.1 Create `packages/client/src/components/SessionSubcard.tsx` exporting `SessionSubcard({ title, children })` per design D1/D6 (inset panel + centered uppercase title; renders nothing when `children` is null/false/empty array)
- [x] 1.2 Add unit tests at `packages/client/src/components/__tests__/SessionSubcard.test.tsx` covering: renders title + children, hides on null, hides on false, hides on empty array

## 2. Plugin slot definition

- [x] 2.1 Add `session-card-memory` entry to `SLOT_DEFINITIONS` in `packages/shared/src/dashboard-plugin/slot-types.ts` (multiplicity `many`, payload tier `react-only`)
- [x] 2.2 Add typed prop contract for `session-card-memory` in `packages/shared/src/dashboard-plugin/slot-props.ts` (mirror `session-card-badge` shape: `{ session: Session }`)
- [x] 2.3 Create `SessionCardMemorySlot` consumer component in `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` (mirror `SessionCardBadgeSlot` pattern)
- [x] 2.4 Update slot-consumer / slot-types tests if any enumerate the full slot list

## 3. SessionCard refactor (desktop branch only)

- [x] 3.1 Import `SessionSubcard` and `SessionCardMemorySlot` in `packages/client/src/components/SessionCard.tsx`
- [x] 3.2 Wrap existing `SessionOpenSpecActions` block in `<SessionSubcard title="OPENSPEC">` using existing prop guards (D2)
- [x] 3.3 Wrap `GitInfo` row + `SessionCardBadgeSlot` in `<SessionSubcard title="WORKSPACE">`; preserve `showGitInfo` guard (D4)
- [x] 3.4 Wrap `ProcessList` block in `<SessionSubcard title="PROCESS">` with existing `processes && processes.length > 0 && onKillProcess` guard
- [x] 3.5 Add `<SessionSubcard title="MEMORY">{<SessionCardMemorySlot session={session} />}</SessionSubcard>`; subcard auto-hides when slot returns no contributions
- [x] 3.6 Wrap `SessionFlowActions` block in `<SessionSubcard title="FLOWS">` with existing flows-guard
- [x] 3.7 Verify subcard order is OPENSPEC → WORKSPACE → PROCESS → MEMORY → FLOWS
- [x] 3.8 Verify header zone (name, model row, activity/cost row) and `SessionCardActionBarSlot` remain outside subcards
- [x] 3.9 Verify mobile branch (top of component) is untouched

## 4. Tests

- [x] 4.1 Update `packages/client/src/components/__tests__/SessionCard.test.tsx`: replace any flat-row assertions with subcard-title queries (`getByText('OPENSPEC')` etc.)
- [x] 4.2 Add test: all five subcard titles render in order when every section has content
- [x] 4.3 Add test: empty PROCESS subcard hidden when `processes={[]}`
- [x] 4.4 Add test: empty MEMORY subcard hidden when no plugin claims `session-card-memory`
- [x] 4.5 Add test: mobile branch (`useMobile()` mocked true) renders no subcard panels
- [x] 4.6 Add test: outer `<li>` retains `border-blue-500/60` + `ring-1 ring-blue-500/30` when selected (regression for chrome preservation)
- [x] 4.7 Add test: streaming session still carries `card-working-pulse` class on outer `<li>`

## 5. Visual QA & docs

- [x] 5.1 Run `npm run build` then `curl -X POST http://localhost:8000/api/restart` and visually verify card matches sketch via `browser-visual-debug` skill
- [x] 5.2 Update `docs/file-index-client.md` row for `SessionCard.tsx` (note subcard structure) and add row for `SessionSubcard.tsx` — delegate to general-purpose subagent per AGENTS.md docs-update protocol (caveman style)
- [x] 5.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm no failures

## 6. Validation

- [x] 6.1 `openspec validate redesign-session-card-subcards` passes
- [x] 6.2 Type-check with `npm run reload:check` (or `tsc --noEmit`) passes

## 7. Iterative polish (added during implementation)

- [x] 7.1 SessionSubcard: switch title from inline centered text to capsule legend overhanging top border (`absolute -top-1.5 rounded-full bg-[var(--bg-tertiary)]`)
- [x] 7.2 SessionSubcard: translucent panel via `bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]`
- [x] 7.3 SessionSubcard: tighten padding (`px-2 py-1.5`) and inter-subcard margin (`mt-1.5`)
- [x] 7.4 SessionOpenSpecActions: remove all three inline `OpenSpec:` labels
- [x] 7.5 SessionFlowActions: remove inline `Flows:` label and the internal `mt-1.5 pt-1.5 border-t` divider
- [x] 7.6 SessionCard: tighten outer card padding (`px-2 py-2`) and gutter↔content gap (`gap-1.5`)
- [x] 7.7 SessionCard: shrink left gutter to `w-2` (was `w-4`); align dot/icon at `pt-1.5`

## 8. Drag handle migration (cards)

- [x] 8.1 Add `workspace-action-bar` slot to `SLOT_DEFINITIONS` (multiplicity many, payloadTier react-only)
- [x] 8.2 Add typed prop contract for `workspace-action-bar` in `slot-props.ts`
- [x] 8.3 Add `WorkspaceActionBarSlot` consumer in `slot-consumers.tsx`
- [x] 8.4 Add `useSlotHasClaimsForSession(slotId, session)` hook in `slot-consumers.tsx`
- [x] 8.5 Reroute `jj-plugin` manifest: `JjActionBar` + `JjInitAffordance` from `session-card-action-bar` → `workspace-action-bar`
- [x] 8.6 Update `jj-plugin/src/__tests__/manifest.test.ts` for new slot id
- [x] 8.7 ~~Reroute honcho-plugin manifest~~ — **DEFERRED** to `openspec/changes/honcho-dashboard-plugin/tasks.md §11` (honcho-scoped follow-up) to keep this PR focused on base UI; `session-card-memory` slot is reserved here but currently unclaimed
- [x] 8.8 SessionCard `WorkspaceSubcard`: include `WorkspaceActionBarSlot` and gate the subcard on `hasGitInfo OR hasBadge OR hasActions`
- [x] 8.9 SortableSessionCard: remove `mdiDragHorizontalVariant` overlay; expose `DragHandleCtx` + `useSessionCardDragHandle()` hook
- [x] 8.10 SessionCard desktop branch: consume drag handle context; spread on left gutter `<div>` with `cursor-grab active:cursor-grabbing`, `data-testid="drag-handle-session"`, click-stop-propagation

## 9. Status icon redesign

- [x] 9.1 SessionCard: derive `iconStatusColor` from `dotColor` via `replace(/\bbg-(?!\[)/g, "text-")`; ended sessions use `text-[var(--text-muted)]`
- [x] 9.2 SessionCard desktop branch: replace round status dot in gutter with source MDI icon (`sourceIcons[session.source]`) colored by `iconStatusColor`; add `data-testid="session-status-icon"` and `title="<source> — <status>"`
- [x] 9.3 SessionCard mobile branch: same replacement on the mobile dot
- [x] 9.4 Update existing tests querying `.bg-green-500` / `.bg-red-500` / `.bg-amber-500` / `.bg-[var(--bg-surface)]` to query `.text-*` equivalents
- [x] 9.5 Update `should show source badge icon` test to query `[title^="<sourceLabel>"]` (title now includes status suffix)

## 10. Folder header redesign

- [x] 10.1 SortablePinnedGroup: remove `mdiDragHorizontalVariant` overlay; expose `FolderDragHandleCtx` + `useFolderDragHandle()` hook
- [x] 10.2 SessionList: extract folder header into a flex row with `FolderDragGutter` (left) + content column (right)
- [x] 10.3 Add `FolderDragGutter` helper component: `w-3` gutter, chevron button at top (stops pointerDown propagation), `flex-1` spacer below as drag area
- [x] 10.4 Remove row-level `onClick={() => handleToggleCollapse(...)}` — chevron is the only toggle target
- [x] 10.5 Remove `ml-5` / `ml-3` indents from branch row, action-bar row, and OpenSpec wrapper in `SessionList.tsx`
- [x] 10.6 Remove internal `ml-5` indents from `FolderOpenSpecSection.tsx` (no longer needed; gutter provides offset)
- [x] 10.7 Tighten outer pinned-group padding `p-2` → `p-1.5`; inner header padding `px-2 py-1.5` → `px-1 py-1`
- [x] 10.8 Verify `session-drag-reorder.test.tsx` still passes (testid `drag-handle-pinned` migrated to `FolderDragGutter`)
