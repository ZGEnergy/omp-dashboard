## ADDED Requirements

### Requirement: OpenSpec section exposes `openspec.enabled` toggle
The settings panel SHALL render a toggle control for `DashboardConfig.openspec.enabled` in the OpenSpec polling configuration block (currently rendered alongside `pollIntervalSeconds`, `maxConcurrentSpawns`, etc. — see `SettingsPanel.tsx` lines ~722–791). The toggle SHALL be a checkbox or switch labeled "Enable OpenSpec" (or equivalent) with help text indicating that disabling it hides all OpenSpec UI surfaces and stops background polling.

When the toggle is `false`, the other `openspec.*` polling-tuning controls (interval, concurrency, change-detection, jitter) SHALL be visually disabled (greyed out) but still display their current values, so the user can re-enable without losing tuning state.

The toggle SHALL be wired to the standard Save flow (writes through `PUT /api/config`); no separate apply button is required.

#### Scenario: Toggle present in OpenSpec settings block
- **WHEN** the user navigates to the settings tab containing the OpenSpec section
- **THEN** an "Enable OpenSpec" toggle control SHALL be visible
- **AND** the control's checked state SHALL reflect `openspec.enabled` from the loaded config

#### Scenario: Disabling toggle disables sibling controls
- **WHEN** the user unchecks the "Enable OpenSpec" toggle
- **THEN** the `pollIntervalSeconds`, `maxConcurrentSpawns`, `changeDetection`, and `jitterSeconds` inputs SHALL be visually disabled (greyed out, non-interactive)
- **AND** their values SHALL remain visible

#### Scenario: Toggle change persists via Save
- **WHEN** the user toggles "Enable OpenSpec" off and clicks Save
- **THEN** `PUT /api/config` SHALL be invoked with `{ openspec: { enabled: false } }`
- **AND** the dashboard SHALL converge to the disabled state per the `shared-config` and `server-openspec-polling` capabilities

#### Scenario: Re-enabling restores controls
- **WHEN** the user re-checks the "Enable OpenSpec" toggle
- **THEN** the sibling polling-tuning controls SHALL become interactive again
- **AND** their values SHALL be unchanged from before the disable
