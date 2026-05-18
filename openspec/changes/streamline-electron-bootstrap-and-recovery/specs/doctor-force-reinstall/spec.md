## ADDED Requirements

### Requirement: Force reinstall section in Doctor
The Doctor window SHALL include a dedicated "Force reinstall managed packages" section presented as a danger-styled card. The section SHALL contain explanatory copy, an audit-panel toggle, and a confirm button.

#### Scenario: Section always visible in Doctor
- **WHEN** the Doctor window is opened
- **THEN** the Force reinstall section SHALL be present
- **AND** it SHALL appear regardless of the health-check or inventory results

#### Scenario: Section explains scope
- **WHEN** the user reads the section
- **THEN** the copy SHALL state that the operation replaces Electron-owned packages, the bundled Node runtime, and the offline cache, while preserving user-installed packages, settings, sessions, and credentials

### Requirement: Audit panel
The section SHALL include a "Show what will be wiped" expand control. When expanded, it SHALL display two lists rendered in monospace: (1) absolute paths that will be wiped, and (2) absolute paths that will be preserved. The lists SHALL be sourced from `planSafeWipe(managedDir)` invoked via the new `doctor:plan-safe-wipe` IPC channel.

#### Scenario: Audit panel populated on expand
- **WHEN** the user clicks "Show what will be wiped"
- **THEN** the audit panel SHALL expand
- **AND** `doctor:plan-safe-wipe` SHALL be invoked
- **AND** the response's `wipe` and `preserve` arrays SHALL render as two labeled lists

#### Scenario: User-installed packages appear in preserve list
- **WHEN** `~/.pi-dashboard/node_modules/pi-foo/` exists (user-installed, not in whitelist)
- **THEN** the path `<managedDir>/node_modules/pi-foo` SHALL appear in the preserve list

#### Scenario: Whitelist packages appear in wipe list
- **WHEN** `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/` exists
- **THEN** the path SHALL appear in the wipe list

#### Scenario: Always-wiped entries present
- **WHEN** the audit panel is populated
- **THEN** `<managedDir>/node/` and `<managedDir>/.offline-cache/` SHALL appear in the wipe list regardless of whether they currently exist on disk

### Requirement: Two-step confirmation
The Force reinstall action SHALL require explicit confirmation via `dialog.showMessageBox` with "Cancel" as the default button. The dialog SHALL summarize what the operation does (replace Electron-owned packages, preserve user data) and SHALL list the wipe scope at a high level.

#### Scenario: Cancel is default
- **WHEN** the confirmation dialog appears
- **THEN** "Cancel" SHALL be the default-focused button
- **AND** pressing Enter or Escape SHALL invoke Cancel
- **AND** the operation SHALL NOT proceed

#### Scenario: Explicit confirm proceeds
- **WHEN** the user clicks the explicit confirm button (typically "Reinstall")
- **THEN** the safe-wipe SHALL run per the plan
- **AND** `installStandalone()` SHALL be invoked afterward
- **AND** the server SHALL be relaunched on completion

### Requirement: Server-running handling
If the dashboard server is currently running when the user confirms Force reinstall, Doctor SHALL shut it down via `/api/shutdown` (preferred) or `requestServerLaunch({force: true})` (fallback) before performing the wipe. The server SHALL be relaunched after the reinstall completes.

#### Scenario: Server stopped before wipe
- **WHEN** the user confirms Force reinstall and the server is running
- **THEN** the server SHALL be shut down before any filesystem mutation
- **AND** the shutdown SHALL complete (or time out at the existing shutdown deadline) before `planSafeWipe` is executed

#### Scenario: Server relaunched after reinstall
- **WHEN** Force reinstall completes successfully
- **THEN** `requestServerLaunch({force: false})` SHALL be invoked
- **AND** the loading page health-check polling SHALL detect the new server

### Requirement: Progress and outcome reporting
Doctor SHALL stream progress during Force reinstall via the existing progress UI patterns. On completion, the outcome (success / failure with reason) SHALL be displayed in the Doctor section and SHALL trigger a refresh of the Doctor's other diagnostic rows (managed Node version, package versions, server status).

#### Scenario: Progress visible during wipe
- **WHEN** the wipe is in progress
- **THEN** the Doctor section SHALL display "Wiping <path>…" updates as each path is removed

#### Scenario: Progress visible during reinstall
- **WHEN** `installStandalone` is running after the wipe
- **THEN** per-package progress SHALL be displayed

#### Scenario: Refresh on completion
- **WHEN** Force reinstall completes
- **THEN** Doctor SHALL automatically re-run its existing diagnostic checks
- **AND** the updated rows SHALL reflect the new managed state

### Requirement: Audit log entry
Every Force reinstall operation SHALL append a structured log entry to `~/.pi-dashboard/doctor.log` capturing the operation type, the list of wiped paths, the list of installed packages, and the outcome (success / partial / failure).

#### Scenario: Log entry on success
- **WHEN** Force reinstall completes successfully
- **THEN** a single log entry SHALL be appended of the form `{"ts":..., "op":"force-reinstall", "wiped":[...], "installed":[...], "outcome":"success"}`

#### Scenario: Log entry on failure
- **WHEN** Force reinstall fails partway
- **THEN** a single log entry SHALL be appended with `"outcome":"failure"` and an `"error":"..."` field
