## MODIFIED Requirements

### Requirement: Config file schema additions for Electron
The shared config module SHALL include a new field:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `electronMode` | boolean | false | Whether the server was launched by the Electron app |

#### Scenario: Config with electronMode
- **WHEN** `~/.pi/dashboard/config.json` contains `{ "electronMode": true }`
- **THEN** `loadConfig()` SHALL return `electronMode: true`

#### Scenario: Empty or missing electronMode
- **WHEN** `~/.pi/dashboard/config.json` does not include `electronMode`
- **THEN** `loadConfig()` SHALL return `electronMode: false`

#### Scenario: ensureConfig excludes electronMode
- **WHEN** `ensureConfig()` creates a new config file
- **THEN** it SHALL NOT include `electronMode` in the written defaults
