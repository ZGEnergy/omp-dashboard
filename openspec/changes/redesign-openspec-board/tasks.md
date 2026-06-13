## 1. Board route + shell

- [ ] 1.1 Add overlay route `/folder/:encodedCwd/openspec` to `App.tsx` (mirror `/archive`, `/specs`) with `useRoute` parsing + `navigate`/`goBackOrHome`
- [ ] 1.2 Create `OpenSpecBoardView` component (top bar: Back, breadcrumb, Refresh, Specs, Archive, + New proposal) reading `OpenSpecData`, sessions, groups, assignments for the cwd
- [ ] 1.3 Port top-bar chrome + theme tokens from `mockups/board.html`; verify against mockup with the browser skill (desktop)

## 2. Folder-card entry point

- [ ] 2.1 Replace `FolderOpenSpecSection` inline expander with a single-line `OpenSpec (N) →` button that navigates to the board route (keep Refresh)
- [ ] 2.2 Remove inline group pills, search, and accordion rendering from the folder card (move to board)
- [ ] 2.3 Update `openspec-folder-section` tests for the navigate-button behavior

## 3. Group columns + reorder

- [ ] 3.1 Render one column per group + always-present `Ungrouped`; header = dot, name, count, `＋`, `⚙`, grip
- [ ] 3.2 Wire column-header drag → reorder via `@dnd-kit` `SortableContext`; persist via `PATCH /api/openspec/groups/:id` `order` (reuse `OpenSpecGroupManager` logic)
- [ ] 3.3 Per-column `⚙` inline manage (rename/recolor/delete) reusing `OpenSpecGroupManager`; `+ Add group` ghost column at board end

## 4. Proposal cards

- [ ] 4.1 Card layout: name + state pill + `OpenSpecStepper` + task progress bar + session list + card actions (`New session`/`New worktree`)
- [ ] 4.2 Wire `onSpawnAttached` / `onSpawnAttachedWorktree` to the card actions
- [ ] 4.3 Wire stepper node clicks to `onReadArtifact` / tasks popover; confirm opaque-base nodes (no line bleed)

## 5. Card drag (between + within columns)

- [ ] 5.1 Draggable cards → drop on a column reassigns group via `setAssignment`
- [ ] 5.2 Intra-column drop computes insert index and reorders within the group
- [ ] 5.3 PointerSensor activation distance; verify drag-vs-scroll on touch (or gate card-drag to desktop)

## 6. Per-change order persistence

- [ ] 6.1 Add per-group ordered change list to the groups/assignments store (shared types + server)
- [ ] 6.2 REST/WS: persist + broadcast order changes (extend groups routes or add an order route)
- [ ] 6.3 Default sort fallback (in-progress → complete → name) when order absent; reassign updates both groups' orders
- [ ] 6.4 Tests for `openspec-change-order` scenarios (reorder persists, per-group, missing-order fallback, move keeps position)

## 7. Session slot in cards

- [ ] 7.1 Render session rows: status indicator, name, age, `OpenSpecActivityBadge` (phase + done/total), stat line (tokens/context/cost)
- [ ] 7.2 Click row → `onNavigateToSession`; action clicks `stopPropagation`
- [ ] 7.3 Per-session actions: resume/continue, fork, hide/unhide (reuse folder-section handlers)
- [ ] 7.4 OpenSpec command menu (Explore, Advance, Fast-forward, Apply, Verify, Archive, Detach) reusing `SessionOpenSpecActions`

## 8. Worktree state visualization

- [ ] 8.1 Detect worktree sessions via `session.gitWorktree`; render `⎇ <name>` marker line
- [ ] 8.2 Derive the worktree's own `done/total` from per-cwd poll of the worktree dir (gated by mtime poller)
- [ ] 8.3 Compute + render delta vs proposal main progress (`+n` ahead green / `-n` behind orange); keep card bar = main
- [ ] 8.4 Tests for `openspec-card-section` worktree scenarios (ahead, behind, non-worktree)

## 9. Filter bar

- [ ] 9.1 Filter bar UI: text input + state pills + session-status pills
- [ ] 9.2 Filter logic: text matches change/session names; state filters cards; session-status filters cards + rows
- [ ] 9.3 Tests for combined filtering

## 10. New-proposal dialog

- [ ] 10.1 Dialog: Name + Group (default = launching column) + "new worktree" checkbox
- [ ] 10.2 Top-bar `+ New proposal` and per-column `＋` open the dialog (column pre-fills group)
- [ ] 10.3 Submit → spawn session running new-change flow (reuse `new-spec-spawn`); worktree variant; auto-assign created change to chosen group
- [ ] 10.4 Tests for dialog defaults + create paths

## 11. Responsive

- [ ] 11.1 Media queries: ≤900px wrap columns; ≤540px stack + wrap top bar (port from mockup)
- [ ] 11.2 Verify desktop kanban, tablet wrap, phone stack with the browser skill (use `/tmp/mobile-preview.html` framing)

## 12. Cleanup + docs

- [ ] 12.1 Remove the old inline accordion path once board reaches parity
- [ ] 12.2 Add board route + components to `docs/file-index-client.md`; update `docs/architecture.md` OpenSpec section (delegate per docs protocol)
- [ ] 12.3 `npm test` green; `npm run build`; restart + `npm run reload`; final mockup-vs-implementation visual check
