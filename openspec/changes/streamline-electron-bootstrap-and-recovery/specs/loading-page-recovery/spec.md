## ADDED Requirements

### Requirement: Diagnostic probe on connection failure
When `loading.html` enters the error state (connection-failure path after the existing ~15s health-check timeout), it SHALL invoke the new `dashboard:check-inventory` IPC channel and SHALL render the result as human-readable diagnosis text in a `<div id="diagnosis">` element above the existing actions row.

#### Scenario: Inventory probe runs on error
- **WHEN** the connection-failure path triggers `showError()`
- **THEN** `api.checkManagedInventory()` SHALL be called exactly once
- **AND** the result SHALL be cached on the page for subsequent button decisions

#### Scenario: Diagnosis hidden when no action needed
- **WHEN** the probe returns `needsAction: false`
- **THEN** the diagnosis row SHALL remain hidden
- **AND** only existing affordances ("Start server", "Open Doctor", log tail) SHALL be visible

#### Scenario: Diagnosis text for missing package
- **WHEN** the probe returns a missing-pi entry
- **THEN** the diagnosis row SHALL display copy of the form "Missing: pi-coding-agent. Reinstall will fetch from the bundled offline cache."

#### Scenario: Diagnosis text for stale package
- **WHEN** the probe returns a stale-pi entry with installed 0.69.0 and expected 0.70.5
- **THEN** the diagnosis row SHALL display copy of the form "Outdated: pi-coding-agent (have 0.69.0, want 0.70.5). Reinstall will update."

#### Scenario: Diagnosis text for corrupt entry
- **WHEN** the probe returns a corrupt entry for any whitelist package
- **THEN** the diagnosis row SHALL display "Corrupt: ~/.pi-dashboard/node_modules entries unreadable. Reinstall will repair."

### Requirement: Reinstall button visibility and behavior
The loading page SHALL render a `[Reinstall managed packages]` primary button when the inventory diagnosis contains any `missing` or `stale` entry. Clicking the button SHALL invoke `dashboard:reinstall-managed` over IPC, stream progress through the existing `dashboard:launch-status` channel, and on completion retry the health-check loop.

#### Scenario: Button visible only when fixable
- **WHEN** the probe returns at least one missing or stale entry
- **THEN** the Reinstall button SHALL be visible and enabled

#### Scenario: Button hidden when only corrupt
- **WHEN** the probe returns only corrupt entries (no missing, no stale)
- **THEN** the Reinstall button SHALL be hidden
- **AND** the Force reinstall affordance SHALL be revealed instead

#### Scenario: Reinstall progress in status line
- **WHEN** reinstall is in progress
- **THEN** the status line SHALL display text of the form "Reinstalling <package-name>…"
- **AND** the Reinstall button SHALL be disabled with text "Reinstalling…"

#### Scenario: Reinstall success retries connection
- **WHEN** reinstall completes successfully
- **THEN** the page SHALL clear the error state
- **AND** the health-check polling loop SHALL resume immediately

#### Scenario: Reinstall failure reveals force option
- **WHEN** reinstall returns a failure outcome
- **THEN** the error state SHALL persist
- **AND** the Force reinstall affordance SHALL become visible under an "Advanced" disclosure

### Requirement: Force reinstall under Advanced
The loading page SHALL provide a `[Force reinstall]` link under an "Advanced" disclosure when the inventory contains a `corrupt` entry OR after a failed `Reinstall managed packages` attempt. Clicking the link SHALL invoke `dashboard:force-reinstall` over IPC, which surfaces a confirmation dialog before performing the safe-wipe + reinstall.

#### Scenario: Force reinstall available on corruption
- **WHEN** the probe returns a corrupt entry
- **THEN** the "Advanced" disclosure SHALL be expanded by default
- **AND** the Force reinstall link SHALL be visible

#### Scenario: Force reinstall available after failed reinstall
- **WHEN** an in-flight reinstall fails
- **THEN** the "Advanced" disclosure SHALL appear and be expanded
- **AND** the Force reinstall link SHALL be enabled

#### Scenario: Force reinstall confirmation
- **WHEN** the user clicks the Force reinstall link
- **THEN** the main process SHALL display a confirmation dialog summarizing the wipe scope
- **AND** the operation SHALL proceed only on explicit confirmation (cancel SHALL be the default)

### Requirement: Existing affordances preserved
The loading page SHALL continue to offer the existing `Start server`, `Open Doctor`, server log tail, and known-servers list. The new recovery affordances SHALL be additive and SHALL NOT replace or visually demote existing actions.

#### Scenario: All existing actions still functional
- **WHEN** the loading page enters the error state
- **THEN** Start server, Open Doctor, server log tail, and known-servers list SHALL all remain functional with their existing behavior
