## ADDED Requirements

### Requirement: Auto-detect code-server binary
The system SHALL detect the code-server binary by checking the following in order:
1. Config override: `editor.binary` in dashboard config
2. `which code-server` on PATH
3. `which openvscode-server` on PATH

The first match SHALL be used. Detection SHALL be performed once at server startup and cached, with re-detection available via API.

#### Scenario: code-server on PATH
- **WHEN** `code-server` is found on PATH and no config override exists
- **THEN** the detection SHALL return `{ available: true, binary: "code-server" }`

#### Scenario: Config override
- **WHEN** `editor.binary` is set to `/usr/local/bin/code-server` in config
- **THEN** the detection SHALL use that path regardless of PATH availability

#### Scenario: openvscode-server fallback
- **WHEN** `code-server` is not on PATH but `openvscode-server` is
- **THEN** the detection SHALL return `{ available: true, binary: "openvscode-server" }`

#### Scenario: Nothing found
- **WHEN** neither binary is found and no config override exists
- **THEN** the detection SHALL return `{ available: false }`

### Requirement: EditorInstallGuide
When the code-server binary is not found, the EditorView SHALL display an installation guide with platform-specific instructions for macOS, Linux, and npm global install.

#### Scenario: macOS install guide
- **WHEN** the install guide is shown on macOS
- **THEN** it SHALL include `brew install code-server` instructions

#### Scenario: Linux install guide
- **WHEN** the install guide is shown on Linux
- **THEN** it SHALL include the curl installer command

#### Scenario: npm install guide
- **WHEN** the install guide is shown
- **THEN** it SHALL include `npm install -g code-server` as a cross-platform option

### Requirement: Config fields
The dashboard config SHALL support an optional `editor` section:
- `editor.binary`: string — Override path to code-server binary
- `editor.idleTimeoutMinutes`: number — Minutes before idle instance is killed (default: 10)
- `editor.maxInstances`: number — Maximum concurrent instances (default: 3)

#### Scenario: Config with editor section
- **WHEN** the config contains `{ editor: { binary: "/opt/code-server", maxInstances: 5 } }`
- **THEN** the server SHALL use `/opt/code-server` as the binary
- **THEN** the max instances cap SHALL be 5
- **THEN** idle timeout SHALL use the default of 10 minutes
