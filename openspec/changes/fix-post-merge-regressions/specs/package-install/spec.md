## ADDED Requirements

### Requirement: Client renders package operation download progress
The client (via `usePackageOperations` hook) SHALL consume the existing `package_operation_progress` WebSocket messages and maintain the latest frame per `operationId`. Components that display an in-progress package operation (`PackageCard`, `PackageInstallConfirmDialog`) SHALL render a progress bar and a stage label derived from that frame.

#### Scenario: Determinate progress bar
- **WHEN** the latest progress frame for an `operationId` has both `bytesReceived` and `bytesTotal > 0`
- **THEN** the component SHALL render a determinate progress bar with width `bytesReceived / bytesTotal` and a text label `"Downloading X.X / Y.Y MB"`

#### Scenario: Indeterminate progress bar
- **WHEN** the latest progress frame has no `bytesTotal` (e.g. git-source install) or `bytesTotal === 0`
- **THEN** the component SHALL render an indeterminate (barber-pole) progress bar plus the current `phase` label

#### Scenario: Stage labels
- **WHEN** the progress frame `phase` is one of `"resolving" | "downloading" | "installing" | "persisting"`
- **THEN** the component SHALL render a human-readable label: `"Resolving…"`, `"Downloading…"`, `"Installing…"`, `"Persisting…"` respectively

#### Scenario: Progress clears on completion
- **WHEN** `package_operation_complete` arrives for an `operationId`
- **THEN** the client SHALL remove that operation's progress state from the `Map` so future renders do not show stale progress

#### Scenario: Progress clears on failure
- **WHEN** `package_operation_failed` arrives for an `operationId`
- **THEN** progress state SHALL be cleared and the component SHALL render the failure reason instead of the progress bar
