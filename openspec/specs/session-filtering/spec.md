## Purpose
Describes how the dashboard sidebar filters which sessions are visible: hide-flag handling, the per-card hide affordance, the visibility toggle in the sidebar header, and the per-folder collapsible ended-sessions group. Drag-reorder restrictions and drag-to-resume rules also live here since they govern session visibility/ordering.
## Requirements
### Requirement: Per-card hide
Each session card SHALL display a hide button `[✕]`. Clicking it SHALL send a `hide_session` message to the server, which sets `hidden = true` on the in-memory session record (persisted via state store) and broadcasts the update to all browsers.

#### Scenario: Hide a session card
- **WHEN** the user clicks the hide button on a session card
- **THEN** the server SHALL mark the session `hidden = true` and broadcast `session_updated` to all browsers

#### Scenario: Hide an active session
- **WHEN** the user hides a session that is still active (not ended)
- **THEN** the session SHALL be hidden regardless of its status

### Requirement: Show hidden toggle

The sidebar SHALL include a `Show hidden` toggle as the only filter chip in the header. When enabled, hidden sessions SHALL reappear in the list with a muted visual style (reduced opacity) and an unhide button `[↩]` replacing the hide button. Hidden sessions SHALL also show resume/fork buttons.

The previous companion `Active only` toggle SHALL be removed; ended sessions are now visible by default inside their folder's collapsible ended-sessions group rather than hidden behind a toggle.

#### Scenario: Show hidden is the only filter chip in the header
- **WHEN** the sidebar header renders
- **THEN** the filter row SHALL contain a `Show hidden` toggle and SHALL NOT contain an `Active only` toggle

#### Scenario: Reveal hidden sessions
- **WHEN** the user enables `Show hidden`
- **THEN** all hidden sessions SHALL appear in the list with reduced opacity, an unhide `[↩]` button, and resume/fork action buttons

#### Scenario: Unhide a session
- **WHEN** the user clicks the unhide `[↩]` button on a hidden session
- **THEN** the server SHALL mark the session `hidden = false` and broadcast `session_updated` to all browsers

### Requirement: Hidden count indicator
When hidden sessions exist and "Show hidden" is OFF, the session list SHALL display an "N hidden" indicator at the bottom of the list.

#### Scenario: Hidden sessions exist
- **WHEN** one or more sessions are hidden and "Show hidden" is OFF
- **THEN** the list SHALL show "N hidden" at the bottom where N is the count

#### Scenario: No hidden sessions
- **WHEN** no sessions are hidden
- **THEN** the hidden count indicator SHALL NOT be displayed

### Requirement: Filter interaction

The `Show hidden` toggle, per-card hide, server-side hidden flag, and per-folder collapsible ended group SHALL work together. The server-side `hidden` flag is the source of truth for `hidden` visibility; the per-folder collapsible group governs `ended` visibility.

#### Scenario: Hidden alive session with Show hidden OFF
- **WHEN** an alive session has `hidden = true` and `Show hidden` is OFF
- **THEN** the session SHALL NOT be visible

#### Scenario: Ended session with Show hidden ON
- **WHEN** an ended session has `hidden = true` and `Show hidden` is ON
- **THEN** the session SHALL be visible with muted styling and resume/fork buttons inside its folder's ended group

### Requirement: Server-side hidden state
Hidden state is managed server-side via the in-memory session manager with persistence through the JSON-backed state store (`~/.pi/dashboard/state.json`). The client-side localStorage hidden set is no longer used. The server is the source of truth for visibility.

#### Scenario: Migration from client-side hidden
- **WHEN** the client detects a legacy `hiddenSessions` key in localStorage
- **THEN** it SHALL ignore it (server-side hidden flag takes precedence) and remove the key

### Requirement: Per-folder ended-sessions collapsible group

Inside each folder, ended sessions SHALL be rendered in a collapsible group below the alive sessions. The group SHALL be collapsed by default with a `N ended` toggle row at the bottom of the folder. When expanded, a second `Hide ended` toggle SHALL appear immediately above the first ended card AND the original `Hide ended` toggle SHALL remain at the bottom — both clickable to collapse.

#### Scenario: Default folder shows alive sessions and collapsed ended row
- **WHEN** a folder contains both alive and ended sessions
- **THEN** alive sessions SHALL render directly
- **AND** a `N ended` toggle row SHALL render at the bottom of the folder

#### Scenario: Expand ended group
- **WHEN** the user clicks the `N ended` toggle row
- **THEN** the ended sessions SHALL render between the alive sessions and the bottom toggle
- **AND** a second `Hide ended` toggle SHALL appear at the top of the ended group
- **AND** the bottom `Hide ended` toggle SHALL also remain visible

#### Scenario: Either toggle collapses the group
- **WHEN** the user clicks either the top or the bottom `Hide ended` toggle
- **THEN** the ended sessions SHALL collapse back into the `N ended` row

#### Scenario: Active filter auto-expands ended
- **WHEN** either the `Folder…` filter or the `Session…` search has a non-empty value
- **THEN** every visible folder's ended group SHALL be auto-expanded
- **AND** the bottom toggle SHALL be hidden during filtered view

### Requirement: Drag-reorder applies only to alive sessions

The persisted drag-reorder list (`sessionOrder`) SHALL contain alive session ids only. When a session transitions from alive to ended, the server SHALL prune its id from `sessionOrder` for that cwd and broadcast `sessions_reordered` with the new order. Subsequent `update()` calls on an already-ended session SHALL NOT re-trigger the prune.

#### Scenario: Active session can be drag-reordered
- **WHEN** the user drags an alive session onto another alive session
- **THEN** `reorder_sessions` SHALL persist the new order
- **AND** the order SHALL survive across server restarts

#### Scenario: Ending a session prunes its order entry once
- **WHEN** a session transitions from alive to `status = "ended"`
- **THEN** the server SHALL remove its id from `sessionOrder` for that cwd
- **AND** SHALL broadcast `sessions_reordered` with the new order
- **AND** subsequent updates on the ended session SHALL NOT re-emit the broadcast

#### Scenario: Drag-to-resume preserves dropped position
- **WHEN** the user drags an ended session onto an alive session in the same folder
- **THEN** `reorder_sessions` SHALL persist the new order with the ended id at the drop position
- **AND** `resume_session` SHALL fire for that id in `continue` mode
- **AND** when the resume completes the card SHALL remain at the dropped position

