## MODIFIED Requirements

### Requirement: Standalone mode installation

In standalone mode, the wizard SHALL install all required tools into the managed location. The pi package installed SHALL be `@earendil-works/pi-coding-agent` by default. The wizard SHALL NOT install `@oh-my-pi/pi-coding-agent`.

#### Scenario: Full standalone install

- **WHEN** standalone mode is active
- **THEN** the wizard SHALL install `@earendil-works/pi-coding-agent`, `@blackbelt-technology/pi-dashboard`, `@fission-ai/openspec`, and `tsx` into `~/.pi-dashboard/node_modules/`
- **AND** show progress per dependency (checking → installing → installed / failed)

#### Scenario: Standalone install uses bundled Node when no system Node

- **WHEN** standalone mode is active and no system Node.js is detected
- **THEN** the installer SHALL use the bundled Node.js and npm from extraResources

#### Scenario: Installation failure with retry

- **WHEN** a dependency installation fails
- **THEN** the wizard SHALL show the error message and a "Retry" button

#### Scenario: Wizard hint message names earendil-works

- **WHEN** the wizard's setup-everything error path renders the "Install pi" hint
- **THEN** the suggested command SHALL be `npm install -g @earendil-works/pi-coding-agent` (not the legacy mariozechner or oh-my-pi names)
