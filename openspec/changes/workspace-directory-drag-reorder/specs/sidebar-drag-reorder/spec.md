## ADDED Requirements

### Requirement: Drag-to-reorder workspaces
Users SHALL be able to reorder workspace containers in the sidebar by dragging a workspace by its header drag handle. On drop, the client SHALL send `{ type: "reorder_workspaces", ids }` with the full new ordering and rely on the server's `workspaces_updated` broadcast to reflect the change.

#### Scenario: Drag a workspace to a new position
- **WHEN** a user drags workspace A from position 1 and drops it onto workspace C at position 3
- **THEN** the client SHALL send `reorder_workspaces` with the ids reordered to place A after C
- **AND** the sidebar SHALL reflect the new order once `workspaces_updated` arrives

#### Scenario: Dropping a workspace on itself is a no-op
- **WHEN** a workspace drag begins and ends on the same workspace
- **THEN** the client SHALL NOT send `reorder_workspaces`

### Requirement: Drag-to-reorder folders within a workspace
Users SHALL be able to reorder folders inside a workspace by dragging. Folders SHALL only reorder within their own workspace; a folder dragged toward a different workspace SHALL NOT move. On drop within the same workspace, the client SHALL send `{ type: "reorder_workspace_folders", id, paths }` with the workspace id and the full new folder ordering.

#### Scenario: Reorder folders inside one workspace
- **WHEN** a user drags a folder within workspace W from position 1 to position 2
- **THEN** the client SHALL send `reorder_workspace_folders` with W's id and the swapped `paths`

#### Scenario: Cross-workspace folder drag is rejected
- **WHEN** a user drags a folder whose `wsId` differs from the drop target's `wsId`
- **THEN** the client SHALL NOT send any reorder message and the folder SHALL remain in its original workspace

### Requirement: Workspace auto-collapse during drag
While a workspace is being dragged, that workspace SHALL render collapsed regardless of its persisted collapsed state, and SHALL return to its prior rendered state when the drag ends or is cancelled. Only the dragged workspace SHALL be affected. This temporary collapse SHALL be client-local and visual only and SHALL NOT emit `set_workspace_collapsed` or alter the server-persisted collapsed preference.

#### Scenario: Expanded workspace collapses during its own drag
- **WHEN** a user begins dragging an expanded workspace
- **THEN** that workspace SHALL render collapsed for the duration of the drag
- **AND** other workspaces SHALL keep their current expanded/collapsed rendering

#### Scenario: Prior state restored on drop
- **WHEN** the drag of a previously-expanded workspace ends or is cancelled
- **THEN** that workspace SHALL render expanded again

#### Scenario: Drag-collapse never persists
- **WHEN** a workspace is dragged and dropped
- **THEN** the client SHALL NOT send `set_workspace_collapsed` as part of the drag interaction

### Requirement: Drop indicator for sidebar drags
While dragging within the sidebar, the hovered drop target SHALL display a visible drop indicator (a dashed outline with a faint accent background). The indicator SHALL apply to workspace, intra-workspace folder, and pinned-directory-group drag targets. The indicator SHALL NOT apply to individual session cards, which retain slide-only feedback.

#### Scenario: Indicator shows on a hovered workspace target
- **WHEN** a workspace is dragged over another workspace slot
- **THEN** the hovered workspace slot SHALL render the drop indicator

#### Scenario: Indicator shows on a hovered folder and pinned-group target
- **WHEN** a folder is dragged over another folder within the same workspace, or a pinned group is dragged over another pinned group
- **THEN** the hovered target slot SHALL render the drop indicator

#### Scenario: No indicator on session cards
- **WHEN** a session card is dragged within its folder
- **THEN** no dashed-slot drop indicator SHALL render on session targets

### Requirement: Type-aware drag collision detection
The sidebar drag-and-drop SHALL constrain candidate drop targets to droppables whose drag `type` matches the active draggable's `type` before measuring distances, so that nested sortable contexts (folders or sessions inside an expanded workspace, or sessions inside an expanded pinned group) do not capture a drag intended for an outer-type target.

#### Scenario: Workspace drag is not captured by inner folders
- **WHEN** a workspace is expanded (its folders visible) and the user drags that workspace over another workspace
- **THEN** the drop target SHALL resolve to a workspace, not an inner folder or session
- **AND** the workspace order SHALL update

#### Scenario: Folder drag is not captured by inner sessions
- **WHEN** a folder inside a workspace is expanded (its sessions visible) and the user drags that folder within the workspace
- **THEN** the drop target SHALL resolve to a folder, not an inner session
