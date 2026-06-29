# flows-edit-mode-settings Specification

## Purpose
Flows-plugin stores a global edit-mode default in plugin config (default off), reconciles it to each session on flows availability via flow:set-edit-mode (persisted to project .pi/settings.json), offers an optional per-session override toggle, and gates the New/Edit action on effective edit-mode.

## Requirements

### Requirement: Global edit-mode default in plugin config

The flows-plugin SHALL register a settings section that stores a global edit-mode default in plugin config, using the established settings pattern (`usePluginConfig` + `plugin_config_write` + `useSettingsDraftSource`). The default SHALL be off.

#### Scenario: Settings section renders the toggle
- **WHEN** the user opens Settings › Plugins › Flows
- **THEN** an "Edit mode" toggle SHALL be shown bound to the plugin config value
- **AND** committing the draft SHALL persist via `plugin_config_write`

#### Scenario: Default is off
- **WHEN** the plugin config has no stored edit-mode value
- **THEN** the effective global default SHALL be off

### Requirement: Edit-mode default reconciled to a session on flows availability

When a session's flows plugin becomes available (detected via the existing `flowsAvailability` / `flow:rediscover` signal), the dashboard SHALL emit `flow:set-edit-mode { enabled: <globalDefault> }` to that session so pi-flows persists it to the project's local `.pi/settings.json`. The dashboard SHALL NOT prompt the user per session.

#### Scenario: Auto-reconcile on availability
- **WHEN** a session reports flows-plugin availability and the global default is `true`
- **THEN** the dashboard SHALL emit `flow:set-edit-mode { enabled: true }` to that session

#### Scenario: No per-session prompt
- **WHEN** edit-mode is reconciled to a session
- **THEN** no interactive confirmation SHALL be shown to the user for that reconcile

### Requirement: Optional per-session override toggle

The flows subcard SHALL offer an optional per-session edit-mode toggle that emits `flow:set-edit-mode { enabled }` for that session only, overriding the reconciled default without changing the global config.

#### Scenario: Per-session override
- **WHEN** the user flips the subcard edit-mode toggle to off for a session whose global default is on
- **THEN** the dashboard SHALL emit `flow:set-edit-mode { enabled: false }` to that session only
- **AND** the global plugin config SHALL remain unchanged

### Requirement: New/Edit action gated on edit-mode

The subcard "New / Edit…" action SHALL be shown only when edit-mode is on for that session.

#### Scenario: Hidden when edit-mode off
- **WHEN** a session's effective edit-mode is off
- **THEN** the "New / Edit…" action SHALL NOT be rendered on its flows subcard

#### Scenario: Shown when edit-mode on
- **WHEN** a session's effective edit-mode is on
- **THEN** the "New / Edit…" action SHALL be rendered
