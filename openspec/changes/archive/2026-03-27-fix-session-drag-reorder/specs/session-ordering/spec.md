## MODIFIED Requirements

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
