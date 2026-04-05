## ADDED Requirements

### Requirement: Honcho config section
The dashboard config at `~/.pi/dashboard/config.json` SHALL support a `honcho` section with fields: `enabled` (boolean, default true), `port` (number, default 8008), `mode` ("docker" | "external", default "docker"), `externalUrl` (string | null, default null), `proxyPort` (number, default 9876), `liveTrackingDefault` (boolean, default false).

#### Scenario: Default config
- **WHEN** no `honcho` section exists in the config
- **THEN** the system uses defaults: enabled=true, port=8008, mode="docker", externalUrl=null, proxyPort=9876, liveTrackingDefault=true

#### Scenario: External mode
- **WHEN** config has `honcho.mode: "external"` and `honcho.externalUrl: "https://api.honcho.dev"`
- **THEN** the system connects to the external Honcho instance and skips Docker management

#### Scenario: Honcho disabled
- **WHEN** config has `honcho.enabled: false`
- **THEN** the system skips all Honcho functionality (Docker, client, conclusions)

#### Scenario: Live tracking default enabled
- **WHEN** config has `honcho.liveTrackingDefault: true`
- **THEN** new sessions start with live knowledge tracking enabled by default
