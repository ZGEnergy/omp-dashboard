## MODIFIED Requirements

### Requirement: electron-forge project configuration
The project SHALL include a `packages/electron/` directory with Electron main process entry point, preload script, and forge configuration.

#### Scenario: Forge config exists
- **WHEN** the project is set up for Electron builds
- **THEN** `packages/electron/forge.config.ts` SHALL define makers for macOS (DMG), Linux (DEB + AppImage), and Windows (NSIS)

#### Scenario: Main process entry point
- **WHEN** the Electron app starts
- **THEN** it SHALL load `packages/electron/src/main.ts` as the main process entry point

### Requirement: CI build matrix
A GitHub Actions workflow SHALL build Electron installers for all target platforms.

#### Scenario: CI produces macOS arm64 DMG
- **WHEN** the CI workflow runs on `macos-14` runner
- **THEN** it SHALL produce a signed `.dmg` for arm64

#### Scenario: CI produces macOS x64 DMG
- **WHEN** the CI workflow runs on `macos-13` runner
- **THEN** it SHALL produce a signed `.dmg` for x64

#### Scenario: CI produces Linux x64 artifacts
- **WHEN** the CI workflow runs on `ubuntu-latest` runner
- **THEN** it SHALL produce an `.AppImage` and `.deb` for x64

#### Scenario: CI produces Windows NSIS installer
- **WHEN** the CI workflow runs on `windows-latest` runner
- **THEN** it SHALL produce an NSIS `.exe` installer for x64

## ADDED Requirements

### Requirement: NSIS Windows installer
The Windows maker SHALL use NSIS to produce a standard installation wizard.

#### Scenario: NSIS installer configuration
- **WHEN** the Windows installer is built
- **THEN** it SHALL use `@felixrieseberg/electron-forge-maker-nsis` with the app icon, one-click install mode, and per-user installation directory

#### Scenario: NSIS installer compatible with electron-updater
- **WHEN** the app is installed via NSIS on Windows
- **THEN** `electron-updater` auto-update SHALL function correctly (download + replace flow)

### Requirement: AppImage Linux package
The Linux build SHALL produce an AppImage in addition to the existing DEB package.

#### Scenario: AppImage maker configured
- **WHEN** the Linux build runs
- **THEN** `@pengx17/electron-forge-maker-appimage` SHALL produce a single `.AppImage` file that runs on any Linux distribution

#### Scenario: AppImage includes app icon
- **WHEN** the AppImage is built
- **THEN** it SHALL embed the app icon for display in desktop environments
