## MODIFIED Requirements

### Requirement: Group sessions by directory
The session list SHALL group sessions by their `cwd` value. Sessions with the same `cwd` SHALL appear together under a group header. ALL groups — including single-session groups — SHALL display a folder header. Sessions within each group SHALL be rendered in the order provided by the server's session order for that cwd.

Pinned directory groups SHALL appear first, in the user-defined pinned order. Unpinned directory groups SHALL appear after pinned groups, sorted by most recent session activity (descending). Pinned directories with zero sessions SHALL still appear as groups.

#### Scenario: Multiple sessions in same directory
- **WHEN** two or more sessions share the same `cwd`
- **THEN** they SHALL be displayed under a group header showing the directory name

#### Scenario: Single session in a directory
- **WHEN** only one session exists for a given `cwd`
- **THEN** the session SHALL be displayed under a group header showing the directory name (same as multi-session groups), with git info on the group header

#### Scenario: Pinned directories appear first
- **WHEN** both pinned and unpinned directory groups exist
- **THEN** pinned groups SHALL appear above unpinned groups, in the user-defined pinned order

#### Scenario: Unpinned directories sorted by recency
- **WHEN** unpinned directory groups exist
- **THEN** they SHALL be ordered by most recent session activity (descending), after all pinned groups

#### Scenario: Pinned directory with no sessions
- **WHEN** a directory is pinned but has no sessions matching that cwd
- **THEN** a group SHALL still be rendered for that directory, showing zero sessions

#### Scenario: Sessions ordered within group
- **WHEN** the server provides an order for a cwd
- **THEN** sessions within that group SHALL be rendered in the server-provided order, with unordered sessions appended by startedAt descending

## REMOVED Requirements

### Requirement: Workspace CRUD operations
**Reason**: Replaced by pinned directories. The workspace system was built but never connected to the client UI. Pinned directories provide the needed visibility/ordering functionality with a simpler model.
**Migration**: No user migration needed — workspace features were never exposed to users. Remove `workspace-store.ts`, workspace REST endpoints, `Workspace` type, `workspaceId` from `DashboardSession`, and `workspace_updated` browser protocol message.
