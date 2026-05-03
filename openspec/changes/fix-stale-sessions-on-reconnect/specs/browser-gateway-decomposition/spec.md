## ADDED Requirements

### Requirement: On-connect snapshot replaces per-session loop

On every browser WebSocket connect, the browser gateway SHALL emit exactly one `sessions_snapshot` message containing all sessions and all non-empty per-cwd session orders. It SHALL NOT emit per-session `session_added` messages or per-cwd `sessions_reordered` messages as part of the on-connect bootstrap.

Live updates after the snapshot SHALL continue to use the existing incremental `session_added`, `session_updated`, `session_removed`, and `sessions_reordered` messages.

#### Scenario: Single snapshot per connection
- **WHEN** a new browser WebSocket connection is established
- **THEN** the gateway SHALL send exactly one message of type `sessions_snapshot` to that socket before any other session-registry-related send
- **AND** the gateway SHALL NOT iterate `sessionManager.listAll()` to send per-session `session_added` for that bootstrap
- **AND** the gateway SHALL NOT iterate `sessionOrderManager.getAllOrders()` to send per-cwd `sessions_reordered` for that bootstrap

#### Scenario: Live update after snapshot uses incremental message
- **WHEN** a bridge registers a new session after the snapshot has been sent on that connection
- **THEN** the gateway SHALL emit the incremental `session_added` for that session as before, NOT another snapshot

#### Scenario: Other on-connect sends preserved
- **WHEN** the gateway sends the snapshot on connect
- **THEN** existing on-connect sends for `pinned_dirs_updated`, `openspec_update`, and `terminal_added` SHALL be preserved unchanged
