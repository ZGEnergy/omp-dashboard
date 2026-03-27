## REMOVED Requirements

### Requirement: Accordion session card expansion
**Reason**: The OpenSpec section no longer lives inside the session card accordion. Change list moves to folder header (`openspec-folder-section`). Session-level attach/actions handled by `openspec-attach-combo`.
**Migration**: Remove `OpenSpecSection` rendering from `SessionCard` accordion. Replace with `SessionOpenSpecActions` component that renders attach combo box and action buttons directly on the card (not in accordion).

### Requirement: OpenSpec section displays change list
**Reason**: Change list moves to folder-level `FolderOpenSpecSection`. Session card no longer shows the full change list.
**Migration**: `FolderOpenSpecSection` in folder header replaces the per-session change list. Session card shows only attached change badge and actions.

### Requirement: Bulk Archive button with confirmation
**Reason**: Bulk Archive moves to folder-level section where it runs server-side CLI directly, not via session prompt.
**Migration**: `FolderOpenSpecSection` includes Bulk Archive button that sends `openspec_bulk_archive { cwd }` to server.

### Requirement: OpenSpec action buttons
**Reason**: Action buttons move from the change list (folder level) to the session card, shown only when a change is attached.
**Migration**: `SessionOpenSpecActions` renders action buttons on the session card when `attachedProposal` is set.

### Requirement: New Change button
**Reason**: Replaced by "New Spec" button on folder card (separate change: `new-spec-spawn`).
**Migration**: Removed from session-level OpenSpec section. Will be added to folder section by `new-spec-spawn` change.

### Requirement: Artifact letter indicators
**Reason**: Artifact letters move to folder-level change list.
**Migration**: `FolderOpenSpecSection` renders artifact letters per change. Same letter/color mapping, just in a different component.

### Requirement: Slim change card layout
**Reason**: Change cards move to folder-level section.
**Migration**: Same layout, rendered in `FolderOpenSpecSection` instead of `OpenSpecSection`.

### Requirement: Refresh button always visible
**Reason**: Refresh moves to folder-level section header.
**Migration**: `FolderOpenSpecSection` header includes refresh button that sends `openspec_refresh { cwd }`.
