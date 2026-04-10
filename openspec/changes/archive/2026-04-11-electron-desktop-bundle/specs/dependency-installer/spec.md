## ADDED Requirements

### Requirement: Detect installed CLI tools
The dependency installer SHALL detect whether `pi`, `openspec`, and the dashboard package are available, checking system PATH first, then the managed install location.

#### Scenario: pi found on system PATH
- **WHEN** `detectPi()` is called and `pi` exists on system PATH
- **THEN** it SHALL return `{ found: true, path: "<system-path>", source: "system" }`

#### Scenario: pi found in managed install
- **WHEN** `detectPi()` is called and `pi` is not on PATH but exists at `~/.pi-dashboard/node_modules/.bin/pi`
- **THEN** it SHALL return `{ found: true, path: "<managed-path>", source: "managed" }`

#### Scenario: pi not found anywhere
- **WHEN** `detectPi()` is called and `pi` is not on PATH and not in managed install
- **THEN** it SHALL return `{ found: false }`

#### Scenario: openspec detection follows same pattern
- **WHEN** `detectOpenSpec()` is called
- **THEN** it SHALL follow the same detection order as `detectPi()` (system PATH → managed install)

#### Scenario: Dashboard package detection
- **WHEN** `detectDashboardPackage()` is called
- **THEN** it SHALL check: global npm install of `@blackbelt-technology/pi-dashboard`, managed install at `~/.pi-dashboard/node_modules/`, and `packages` array in `~/.pi/agent/settings.json`

### Requirement: Standalone mode installation
In standalone mode, the installer SHALL install all tools into `~/.pi-dashboard/node_modules/`.

#### Scenario: Install all standalone dependencies
- **WHEN** `installStandalone()` is called
- **THEN** it SHALL run `npm install @mariozechner/pi-coding-agent @blackbelt-technology/pi-dashboard @fission-ai/openspec tsx` in `~/.pi-dashboard/`
- **AND** use system npm if available, otherwise bundled npm

#### Scenario: First install initializes directory
- **WHEN** `~/.pi-dashboard/` does not exist
- **THEN** the installer SHALL create it and write a minimal `package.json` before running npm install

#### Scenario: Managed install registers bridge with pi
- **WHEN** the dashboard package is installed in `~/.pi-dashboard/node_modules/`
- **THEN** pi sessions spawned with `~/.pi-dashboard/node_modules/.bin` on PATH SHALL discover the bridge extension via the dashboard package's `pi.extensions` field

### Requirement: Power user mode verification and fix
In power user mode, the installer SHALL verify existing tools and offer to fix gaps.

#### Scenario: Install dashboard package globally for power user
- **WHEN** `installDashboardGlobal()` is called
- **THEN** it SHALL run `npm install -g @blackbelt-technology/pi-dashboard` using system npm

#### Scenario: Install falls back to bundled Node
- **WHEN** no system Node.js is detected on PATH
- **THEN** the installer SHALL use the bundled Node.js and npm from extraResources

### Requirement: Managed install location
The managed install directory SHALL be `~/.pi-dashboard/` with a `package.json` initialized automatically.

#### Scenario: PATH includes managed bin
- **WHEN** the server or pi is spawned by the Electron app
- **THEN** `~/.pi-dashboard/node_modules/.bin` SHALL be prepended to the spawned process's PATH

### Requirement: TS loader resolution
The installer SHALL provide a function to resolve the appropriate TypeScript loader based on installation mode.

#### Scenario: Standalone mode resolves tsx
- **WHEN** `resolveTsLoader("standalone")` is called
- **THEN** it SHALL return the path to tsx's ESM loader from `~/.pi-dashboard/node_modules/tsx`

#### Scenario: Power user mode resolves jiti first
- **WHEN** `resolveTsLoader("power-user")` is called
- **THEN** it SHALL attempt to resolve jiti from pi's install (via `resolveJitiImport()`), falling back to tsx if jiti is not found
