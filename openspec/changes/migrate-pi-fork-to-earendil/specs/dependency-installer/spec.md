## MODIFIED Requirements

### Requirement: Standalone mode installation

In standalone mode, the installer SHALL install all tools into `~/.pi-dashboard/node_modules/`. The pi package installed SHALL be `@earendil-works/pi-coding-agent` by default; an explicit override is permitted only for offline-cache scenarios that pin a legacy fork.

#### Scenario: Install all standalone dependencies

- **WHEN** `installStandalone()` is called with no override
- **THEN** it SHALL run `npm install @earendil-works/pi-coding-agent @blackbelt-technology/pi-dashboard @fission-ai/openspec tsx` in `~/.pi-dashboard/`
- **AND** use system npm if available, otherwise bundled npm

#### Scenario: First install initializes directory

- **WHEN** `~/.pi-dashboard/` does not exist
- **THEN** the installer SHALL create it and write a minimal `package.json` before running npm install

#### Scenario: Managed install registers bridge with pi

- **WHEN** the dashboard package is installed in `~/.pi-dashboard/node_modules/`
- **THEN** pi sessions spawned with `~/.pi-dashboard/node_modules/.bin` on PATH SHALL discover the bridge extension via the dashboard package's `pi.extensions` field

#### Scenario: Legacy override accepted for offline cache

- **WHEN** the offline-cache manifest pins `@mariozechner/pi-coding-agent` and the dependency installer is invoked with `pkgs: ["@mariozechner/pi-coding-agent", ...]`
- **THEN** `npm install` SHALL succeed against the legacy name without altering the resolution-chain alias order
