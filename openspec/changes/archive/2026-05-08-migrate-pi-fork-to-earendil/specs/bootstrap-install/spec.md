## MODIFIED Requirements

### Requirement: Electron artifacts ship a per-platform offline npm cache

Every published Electron artifact (DMG, DEB, AppImage, NSIS, ZIP / portable) SHALL include a `resources/offline-packages/` directory containing a `manifest.json` and a `npm-cache.tar.gz` gzip of a pre-populated npm `_cacache/` tree targeted at that artifact's platform. The cache SHALL contain every tarball required to install the dashboard's pinned pi build (`@earendil-works/pi-coding-agent` or, for legacy artefacts, `@mariozechner/pi-coding-agent`), `@fission-ai/openspec`, and `tsx` at their pinned versions without any network access.

The pi-package name embedded in the manifest is the one the artefact's first-run installer will pass to `npm install --offline`. The dashboard SHALL accept either supported name as a primary install target; producing artefacts that pin one or the other is a build-time decision tracked by the offline-cache regeneration tooling. Artefacts SHALL NOT pin `@oh-my-pi/pi-coding-agent`.

#### Scenario: Manifest and cache present in packaged ZIP

- **WHEN** a user unzips the Windows portable ZIP
- **THEN** `<app>/resources/offline-packages/manifest.json` exists
- **AND** `<app>/resources/offline-packages/npm-cache.tar.gz` exists
- **AND** `manifest.json.targetPlatform` equals `"win32-x64"`

#### Scenario: Cache integrity declared

- **WHEN** the build script produces the cache tarball
- **THEN** `manifest.json.sha256` matches the SHA-256 of the tarball content

#### Scenario: Per-platform payloads

- **WHEN** the macOS arm64 DMG and the Windows x64 NSIS are both inspected
- **THEN** each contains a `manifest.json` whose `targetPlatform` matches the artifact's platform
- **AND** neither ships the other platform's cache

### Requirement: Single shared installer module

The system SHALL expose a single `bootstrapInstall` function in `packages/shared/src/bootstrap-install.ts` callable from all entry points (Electron wizard, `pi-dashboard` CLI first-run, `pi-dashboard upgrade-pi` CLI, `/api/bootstrap/upgrade-pi` REST). The function's default `packages` list SHALL install `@earendil-works/pi-coding-agent` as the primary pi package, with `@fission-ai/openspec` and `tsx` alongside.

When the offline cache pins the legacy `@mariozechner/pi-coding-agent` name, callers MAY override the default list to match the cached name.

#### Scenario: Electron wizard uses shared installer

- **WHEN** the Electron wizard runs "Setup everything"
- **THEN** it calls `bootstrapInstall` from the shared module, not a local Electron-only function

#### Scenario: CLI first-run uses shared installer

- **WHEN** `pi-dashboard` starts and pi resolution fails
- **THEN** the server calls `bootstrapInstall` with `packages: ["@earendil-works/pi-coding-agent", "@fission-ai/openspec", "tsx"]` async, without blocking server startup

#### Scenario: CLI first-run accepts legacy override for offline-pinned artefact

- **WHEN** the offline cache manifest pins `@mariozechner/pi-coding-agent` and the offline-install path is taken
- **THEN** the caller MAY pass `packages: ["@mariozechner/pi-coding-agent", "@fission-ai/openspec", "tsx"]` and the installer SHALL succeed against the legacy name
