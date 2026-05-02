## MODIFIED Requirements

### Requirement: DMG configuration
The DMG maker SHALL produce a properly branded macOS disk image whose
artifact filename uniquely identifies the target architecture, so that
the GitHub Release can carry per-arch DMG assets without basename
collision when uploaded by `softprops/action-gh-release@v2` (which
de-duplicates by basename). The maker's window title MAY remain a
human-friendly "PI Dashboard" string; only the artifact filename is
constrained.

#### Scenario: DMG basename includes architecture and version
- **WHEN** `@electron-forge/maker-dmg` runs on a `darwin/arm64` matrix leg
- **THEN** the produced DMG basename SHALL match `PI-Dashboard-darwin-arm64-${version}.dmg`
- **AND WHEN** `@electron-forge/maker-dmg` runs on a `darwin/x64` matrix leg
- **THEN** the produced DMG basename SHALL match `PI-Dashboard-darwin-x64-${version}.dmg`
- **AND** the `${version}` token SHALL be the value read from `packages/electron/package.json#version` at config-evaluation time
- **AND** the maker's `name` config field SHALL be composed in `packages/electron/forge.config.ts` (not via electron-builder-style `${version}` placeholder substitution, which the DMG maker does not support)

#### Scenario: DMG window title remains human-readable
- **WHEN** the DMG is built
- **THEN** the maker's `title` config field SHALL remain `"PI Dashboard"` so the mounted-volume window title bar shows a friendly string regardless of the verbose artifact filename
- **AND** the `icon` config field SHALL continue to point at `resources/icon.icns`

#### Scenario: GitHub Release contains two distinct DMG assets per release
- **WHEN** a release tag is pushed AND the publish workflow's `electron` matrix completes both the `darwin/arm64` and `darwin/x64` legs successfully
- **THEN** the resulting GitHub Release SHALL contain exactly two DMG assets, with distinct basenames identifying their architectures
- **AND** neither DMG asset SHALL have a basename of `PI Dashboard.dmg` or any other arch-ambiguous form
- **AND** the existing `softprops/action-gh-release@v2` upload step SHALL NOT need a per-leg rename / staging hop — distinct basenames at maker-output time are sufficient for the upload-by-glob pattern (`electron-*/**/*`) to land both assets cleanly

#### Scenario: Regression test pins the maker config
- **WHEN** the test suite runs in `packages/electron/`
- **THEN** there SHALL exist a unit test that imports `forge.config.ts` and asserts the resolved DMG maker `name` field, when evaluated with `process.arch === "arm64"`, contains the substring `"darwin-arm64"`, AND when evaluated with `process.arch === "x64"`, contains `"darwin-x64"`
- **AND** the test SHALL fail CI if a future refactor reintroduces a static name
