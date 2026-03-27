## Purpose

Enables per-directory session ordering with persistence, auto-placement rules, and drag-and-drop reordering via the browser client.

## ADDED Requirements

### Requirement: Persist session order per directory
The server SHALL maintain an ordered list of session IDs per cwd. The order SHALL be persisted in the state JSON file under a `sessionOrder` key mapping cwd strings to session ID arrays.

#### Scenario: Order persists across server restarts
- **WHEN** session order is set for a cwd and the server restarts
- **THEN** the order SHALL be restored from the state JSON file

#### Scenario: Empty order for unknown cwd
- **WHEN** no order has been set for a cwd
- **THEN** `getOrder(cwd)` SHALL return an empty array

### Requirement: Auto-place new sessions at the beginning
When a new session registers, the server SHALL prepend its ID to the front of the order array for its cwd.

#### Scenario: New session prepended
- **WHEN** a session registers with cwd `/project` and the current order is `["s1", "s2"]`
- **THEN** the order SHALL become `["s3", "s1", "s2"]`

#### Scenario: First session in a cwd
- **WHEN** a session registers with a cwd that has no existing order
- **THEN** the order SHALL be `["s1"]`

### Requirement: Auto-place forked sessions after parent
When a fork is initiated, the server SHALL record a pending fork entry with the parent session ID and cwd. When the new session registers in that cwd, it SHALL be inserted immediately after the parent session in the order array.

#### Scenario: Fork inserts after parent
- **WHEN** session "s2" is forked from session "s1" in cwd `/project` with order `["s1", "s3"]`
- **THEN** the order SHALL become `["s1", "s2", "s3"]`

#### Scenario: Fork pending entry expires
- **WHEN** a fork is initiated but no new session registers within 30 seconds
- **THEN** the pending fork entry SHALL be discarded
- **AND** if the session registers later, it SHALL be prepended as a normal new session

#### Scenario: Fork parent not in order array
- **WHEN** a fork's parent session ID is not found in the order array
- **THEN** the forked session SHALL be prepended (fallback to new session behavior)

### Requirement: Continued sessions keep position
When a session is resumed with `mode: "continue"`, the same session ID re-registers. The server SHALL NOT change its position in the order array.

#### Scenario: Continue preserves position
- **WHEN** session "s1" is at position 1 in order `["s0", "s1", "s2"]` and is resumed with continue
- **THEN** the order SHALL remain `["s0", "s1", "s2"]`

### Requirement: Drag-and-drop reorder via browser
The browser SHALL be able to send a `reorder_sessions` message with the full ordered session ID array for a cwd. The server SHALL replace the stored order with the provided array.

#### Scenario: Reorder via drag-and-drop
- **WHEN** the browser sends `reorder_sessions` with cwd `/project` and sessionIds `["s2", "s1", "s3"]`
- **THEN** the server SHALL store the order as `["s2", "s1", "s3"]` and broadcast `sessions_reordered` to all browsers

### Requirement: Broadcast order changes
The server SHALL broadcast a `sessions_reordered` message to all connected browsers whenever the order for a cwd changes (insert, reorder, or removal).

#### Scenario: Order broadcast on new session
- **WHEN** a new session is prepended to a cwd's order
- **THEN** the server SHALL broadcast `sessions_reordered` with the updated order

#### Scenario: Order broadcast on drag-and-drop
- **WHEN** the browser sends `reorder_sessions`
- **THEN** the server SHALL broadcast `sessions_reordered` to all connected browsers

### Requirement: Prune stale session IDs from order
When returning the order for a cwd, the server SHALL filter out session IDs that no longer exist in the session manager.

#### Scenario: Stale ID pruned
- **WHEN** the order contains `["s1", "s2", "s3"]` but "s2" no longer exists in the session manager
- **THEN** `getOrder(cwd)` SHALL return `["s1", "s3"]`

### Requirement: Client renders sessions in server order
The client SHALL sort session cards within a folder group according to the order received from the server. Sessions not present in the order array SHALL be appended, sorted by `startedAt` descending.

#### Scenario: Sessions rendered in order
- **WHEN** the server order for a cwd is `["s2", "s1"]`
- **THEN** session "s2" SHALL appear before session "s1" in the UI

#### Scenario: Unordered sessions appended
- **WHEN** the server order is `["s1"]` but the group also contains "s2" and "s3"
- **THEN** "s1" SHALL appear first, followed by "s2" and "s3" sorted by `startedAt` descending

### Requirement: Client drag-and-drop interaction
The client SHALL allow users to drag session cards within a folder group to reorder them. On drop, the client SHALL send a `reorder_sessions` message with the new order. The client SHALL use a single `DndContext` for both session card and pinned directory group drag-and-drop, using the `data` property on sortable items to discriminate item types.

#### Scenario: Drag session card in unpinned group
- **WHEN** the user drags session "s2" above session "s1" in an unpinned folder group
- **THEN** the client SHALL send `reorder_sessions` with the updated order array
- **AND** optimistically reorder the cards before server confirmation

#### Scenario: Drag session card in pinned group
- **WHEN** the user drags session "s2" above session "s1" in a pinned folder group
- **THEN** the client SHALL send `reorder_sessions` with the updated order array
- **AND** optimistically reorder the cards before server confirmation

#### Scenario: Drag pinned group does not affect session order
- **WHEN** the user drags a pinned directory group to a new position
- **THEN** the client SHALL reorder pinned directories
- **AND** session order within each group SHALL remain unchanged

#### Scenario: Cross-type drag is ignored
- **WHEN** a session card is dragged over a pinned directory group droppable (or vice versa)
- **THEN** the client SHALL not perform any reorder
