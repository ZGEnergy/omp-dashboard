## ADDED Requirements

### Requirement: electron-forge project configuration
The project SHALL include an `electron/` directory with Electron main process entry point, preload script, and forge configuration.

#### Scenario: Forge config exists
- **WHEN** the project is set up for Electron builds
- **THEN** `electron/forge.config.ts` SHALL define makers for macOS (dmg), Linux (deb, AppImage), and Windows (squirrel/NSIS)

#### Scenario: Main process entry point
- **WHEN** the Electron app starts
- **THEN** it SHALL load `electron/main.ts` as the main process entry point

### Requirement: node-pty native rebuild (deferred)
The node-pty rebuild is NOT required for MVP. The server runs as a separate detached process using system Node.js, so node-pty in the server works without Electron-specific rebuilding. This requirement is deferred to a future enhancement where the server might run in-process.

#### Scenario: Server handles PTY allocation
- **WHEN** the Electron app is running
- **THEN** terminal sessions SHALL be handled by the detached server process using system Node's node-pty (no Electron rebuild needed)

### Requirement: Node.js binary included as extraResources
The build pipeline SHALL download and include the correct Node.js binary for the target platform in the packaged app's resources.

#### Scenario: extraResources configured
- **WHEN** the app is packaged
- **THEN** the stripped Node.js binary (node + npm only) SHALL be placed in `resources/node/`

### Requirement: CI build matrix
A GitHub Actions workflow SHALL build Electron installers for all target platforms.

#### Scenario: CI produces macOS arm64 DMG
- **WHEN** the CI workflow runs on `macos-14` runner
- **THEN** it SHALL produce a signed `.dmg` for arm64

#### Scenario: CI produces macOS x64 DMG
- **WHEN** the CI workflow runs on `macos-13` runner
- **THEN** it SHALL produce a signed `.dmg` for x64

#### Scenario: CI produces Linux AppImage
- **WHEN** the CI workflow runs on `ubuntu-latest` runner
- **THEN** it SHALL produce an `.AppImage` and `.deb` for x64

#### Scenario: CI produces Windows installer
- **WHEN** the CI workflow runs on `windows-latest` runner
- **THEN** it SHALL produce an `.exe` installer for x64

### Requirement: npm scripts for Electron
The project SHALL add npm scripts for Electron development and building.

#### Scenario: Electron dev script
- **WHEN** `npm run electron:dev` is run
- **THEN** it SHALL start Electron in dev mode pointing at the external dev server

#### Scenario: Electron build script
- **WHEN** `npm run electron:make` is run
- **THEN** it SHALL produce platform installers in `out/`
