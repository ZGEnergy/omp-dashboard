## 1. Create FolderOpenSpecSection component

- [x] 1.1 Create `src/client/components/FolderOpenSpecSection.tsx` with props: `data: OpenSpecData`, `cwd: string`, `onRefresh: () => void`, `onBulkArchive: () => void`
- [x] 1.2 Implement collapsible header: `▶ OpenSpec (N changes)` with chevron toggle, Refresh icon button, Bulk Archive button
- [x] 1.3 Implement expanded change list: sorted (in-progress first, then complete), each showing name, artifact letters, task count — reuse `ArtifactLetters` and `statusColor` helpers from existing `OpenSpecSection`
- [x] 1.4 Implement Bulk Archive confirmation dialog (reuse `ConfirmDialog`)
- [x] 1.5 Write tests for `FolderOpenSpecSection`: collapsed by default, expand/collapse toggle, change list rendering, refresh callback, bulk archive confirmation flow

## 2. Create SessionOpenSpecActions component

- [x] 2.1 Create `src/client/components/SessionOpenSpecActions.tsx` with props: `session: DashboardSession`, `changes: OpenSpecChange[]`, `onAttach: (changeName: string) => void`, `onDetach: () => void`, `onSendPrompt: (text: string) => void`
- [x] 2.2 Implement attach combo box: `<select>` dropdown listing changes (in-progress first), placeholder "Attach change...", disabled when no changes
- [x] 2.3 Implement attached state: badge `📋 changeName`, action buttons (Continue, FF, Apply, Archive, Explore based on change status), Detach button
- [x] 2.4 Hide LLM action buttons when session is ended
- [x] 2.5 Handle attached change not found in OpenSpec data: show badge + Detach only
- [x] 2.6 Write tests for `SessionOpenSpecActions`: combo box rendering, attach on select, action buttons per status, detach, ended session hides buttons

## 3. Add Bulk Archive server-side handler

- [x] 3.1 Add `openspec_bulk_archive` message type to `browser-protocol.ts` with `cwd: string` field
- [x] 3.2 Handle `openspec_bulk_archive` in `browser-gateway.ts`: run `openspec archive --completed` (or equivalent CLI command) in the specified cwd via `spawnSync`, then trigger OpenSpec refresh for that directory
- [x] 3.3 Write test for bulk archive handler

## 4. Integrate FolderOpenSpecSection into SessionList

- [x] 4.1 Import `FolderOpenSpecSection` in `SessionList.tsx`
- [x] 4.2 Render `FolderOpenSpecSection` in `renderGroup()` after `GroupGitInfo` and before editor/spawn buttons, passing `openspecMap.get(group.cwd)` and cwd
- [x] 4.3 Wire `onRefresh` to send `openspec_refresh { cwd }` via WebSocket
- [x] 4.4 Wire `onBulkArchive` to send `openspec_bulk_archive { cwd }` via WebSocket
- [x] 4.5 Add `onBulkArchive` callback prop to `SessionList` and wire from `App.tsx`

## 5. Integrate SessionOpenSpecActions into SessionCard

- [x] 5.1 Replace `OpenSpecSection` rendering in `SessionCard` accordion with `SessionOpenSpecActions`
- [x] 5.2 Pass folder-level `changes` array to `SessionCard` (from `openspecMap.get(session.cwd)?.changes`)
- [x] 5.3 Remove `openspecData` prop from `SessionCard` (no longer needs full OpenSpec data per session)
- [x] 5.4 Keep `OpenSpecActivityBadge` rendering unchanged on session card
- [x] 5.5 Remove `onOpenSpecRefresh` prop from `SessionCard` (refresh is now folder-level)

## 6. Update App.tsx data flow

- [x] 6.1 Ensure `openspecMap` is `Map<cwd, OpenSpecData>` (should already be after `server-side-directory-services`)
- [x] 6.2 Remove `handleOpenSpecRefresh` per-session handler, add per-cwd handler
- [x] 6.3 Add `handleBulkArchive(cwd)` handler that sends `openspec_bulk_archive` message
- [x] 6.4 Pass `openspecMap` to `SessionList` (already done), ensure it passes through to both folder and session components

## 7. Clean up old OpenSpecSection

- [x] 7.1 Delete `src/client/components/OpenSpecSection.tsx` (replaced by `FolderOpenSpecSection` + `SessionOpenSpecActions`)
- [x] 7.2 Delete `src/client/components/__tests__/OpenSpecSection.test.tsx`
- [x] 7.3 Remove `ExploreDialog` import/usage if no longer needed (Explore action moves to session-level) — kept: still used by SessionOpenSpecActions
- [x] 7.4 Update any remaining imports of `OpenSpecSection` — no remaining imports

## 8. Verify and update docs

- [x] 8.1 Run full test suite, fix broken tests
- [x] 8.2 Manual smoke test: folder header shows OpenSpec section with changes
- [x] 8.3 Manual smoke test: session card shows attach combo, attaching shows action buttons
- [x] 8.4 Manual smoke test: bulk archive from folder level works
- [x] 8.5 Update `AGENTS.md` key files table with new component names
