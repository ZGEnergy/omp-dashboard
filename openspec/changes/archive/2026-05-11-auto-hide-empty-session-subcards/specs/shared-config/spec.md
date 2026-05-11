## ADDED Requirements

### Requirement: `openspec.enabled` config field gates OpenSpec functionality globally
The shared config schema SHALL include an optional boolean field `openspec.enabled` with default value `true`. When `false`, the dashboard SHALL treat OpenSpec as fully disabled — no polling, no UI surfaces. Other `openspec.*` poll-tuning fields (`pollIntervalSeconds`, `maxConcurrentSpawns`, `changeDetection`, `jitterSeconds`) SHALL retain their meaning but be ignored at runtime when `enabled === false`.

The field SHALL be parseable by `parseOpenSpecPollConfig` and round-trip through `~/.pi/dashboard/config.json` reads/writes. Invalid (non-boolean) values SHALL fall back to the default `true`. Existing config files without the field SHALL behave exactly as today.

#### Scenario: Default value is true when field absent
- **WHEN** `~/.pi/dashboard/config.json` contains `{ "openspec": { "pollIntervalSeconds": 60 } }` (no `enabled` key)
- **THEN** `loadConfig().openspec.enabled` SHALL be `true`

#### Scenario: Explicit false is preserved
- **WHEN** `~/.pi/dashboard/config.json` contains `{ "openspec": { "enabled": false } }`
- **THEN** `loadConfig().openspec.enabled` SHALL be `false`
- **AND** other `openspec.*` fields SHALL retain their default values

#### Scenario: Non-boolean value falls back to default
- **WHEN** `~/.pi/dashboard/config.json` contains `{ "openspec": { "enabled": "yes" } }`
- **THEN** `loadConfig().openspec.enabled` SHALL be `true`

#### Scenario: Round-trip via PUT /api/config
- **WHEN** a `PUT /api/config` request sets `{ "openspec": { "enabled": false } }`
- **THEN** the value SHALL persist to `~/.pi/dashboard/config.json`
- **AND** subsequent `GET /api/config` SHALL return `openspec.enabled === false`
