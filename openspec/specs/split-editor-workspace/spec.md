# split-editor-workspace Specification

## Purpose
TBD - created by archiving change split-editor-workspace. Update Purpose after archive.
## Requirements
### Requirement: Content area SHALL host a chat + editor split

The session content area SHALL support a split that renders `ChatView` and the
internal editor pane simultaneously. When the split is **closed**, the content area
SHALL render `ChatView` alone (current behaviour). When **open**, it SHALL render
`ChatView`, a draggable divider, and the editor pane together.

On desktop the split SHALL be horizontal (chat on the left, editor on the right). At
or below the mobile breakpoint (`useMobile()` true) the split SHALL stack vertically
(chat on top, editor on the bottom) with a row-resize divider.

#### Scenario: Opening the split shows both panes
- **GIVEN** a session is showing `ChatView` with the split closed
- **WHEN** the user activates the split toggle in the session header
- **THEN** the content area renders `ChatView`, a divider, and the editor pane
- **AND** the conversation remains visible and interactive

#### Scenario: Mobile stacks the split vertically
- **GIVEN** the viewport is below the mobile breakpoint
- **WHEN** the split is open
- **THEN** `ChatView` renders above the editor pane
- **AND** the divider is a horizontal (row-resize) handle between them

### Requirement: Split SHALL be unsplittable and re-splittable

The session header SHALL expose a toggle that opens and closes the split. Closing the
split SHALL return the content area to `ChatView`-only without destroying the editor
pane's persisted state (open tabs, tree expansion). Re-opening the split SHALL restore
the pane's prior state.

#### Scenario: Unsplit preserves pane state
- **GIVEN** the split is open with three tabs in the editor pane
- **WHEN** the user unsplits
- **THEN** the content area shows `ChatView` alone
- **AND** the three tabs remain in the pane's persisted state

#### Scenario: Re-split restores pane state
- **GIVEN** the split was unsplit with three tabs persisted
- **WHEN** the user re-opens the split
- **THEN** the editor pane renders with the three tabs and the previously active one

### Requirement: Divider SHALL resize the split and persist the ratio

A draggable divider SHALL resize the two panes. The split ratio SHALL be stored as a
fraction (0..1) so it survives window resizes, and SHALL be clamped so neither pane
collapses below a usable minimum (`[0.25, 0.75]`). The ratio SHALL persist per session.

#### Scenario: Dragging resizes both panes
- **WHEN** the user drags the divider left
- **THEN** the chat pane narrows and the editor pane widens by the same amount
- **AND** the divider stops at the clamp boundary before either pane collapses

#### Scenario: Ratio persists across reload
- **GIVEN** the user set the split ratio to 60/40
- **WHEN** the page reloads and the split re-opens
- **THEN** the panes render at the 60/40 ratio

### Requirement: Split state SHALL persist per session in localStorage

Split open state, ratio, and orientation SHALL persist under
`pi-dashboard:split:<sessionId>`. State SHALL be scoped per session id — switching
sessions SHALL load that session's split state. Persistence SHALL be best-effort:
quota errors and corrupt JSON SHALL NOT crash the workspace.

#### Scenario: Per-session split state
- **GIVEN** session A has the split open at 50/50 and session B has it closed
- **WHEN** the user switches from A to B
- **THEN** session B renders with the split closed
- **AND** switching back to A restores the open 50/50 split

#### Scenario: Corrupt split state does not crash
- **GIVEN** `localStorage` holds malformed JSON for `pi-dashboard:split:<id>`
- **WHEN** the session opens
- **THEN** the workspace renders with the split closed (default)
- **AND** an error is logged and subsequent split changes function normally

### Requirement: Opening a file auto-opens the split

The pane SHALL route every file-open entry point (chat file-link, tool-result file
path, file-tree click, search-result selection) through a single `openInSplit` helper.
When the split is closed, the helper SHALL open the split first, then open the file in
the editor pane, focus its tab, and scroll to the requested line when provided. The
`/session/:id/editor` route SHALL be retained as a deep-link that opens the split via
the same helper.

#### Scenario: Clicking a file-link in chat auto-splits
- **GIVEN** the split is closed
- **WHEN** the user clicks a file path rendered in a chat message or tool result
- **THEN** the split opens
- **AND** the clicked file opens in the editor pane as the active tab

#### Scenario: Deep-link route opens the split
- **GIVEN** the split is closed
- **WHEN** the user navigates to `/session/:id/editor?file=src/foo.ts&line=42`
- **THEN** the split opens with `src/foo.ts` active, scrolled to line 42
- **AND** `ChatView` remains rendered alongside the pane

