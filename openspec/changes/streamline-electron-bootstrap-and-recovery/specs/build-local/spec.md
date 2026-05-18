## ADDED Requirements

### Requirement: build:local npm script
The `packages/electron/package.json` SHALL declare an npm script `build:local` that produces a fully offline-capable Electron app for the local host platform with a single command. The script SHALL default `BUNDLE_OFFLINE_PACKAGES=1` so the resulting installer ships with the offline npm cacache for `pi-coding-agent`, `openspec`, and `tsx`.

#### Scenario: Single-command local build
- **WHEN** a developer runs `npm run build:local` in `packages/electron/`
- **THEN** the build SHALL produce an installer in `out/make/` for the host platform
- **AND** the installer SHALL contain the bundled offline cacache at `resources/offline-packages/`
- **AND** the installer SHALL contain the bundled Node runtime at `resources/node/`
- **AND** the installer SHALL contain the bundled server at `resources/server/`

#### Scenario: User env overrides preserved
- **WHEN** a developer runs `BUNDLE_OFFLINE_PACKAGES=0 npm run build:local`
- **THEN** the offline cacache SHALL NOT be bundled
- **AND** the resulting installer SHALL behave as today's `npm run make` (online-only first launch)

### Requirement: build:local:offline opt-in for recommended extensions
The `packages/electron/package.json` SHALL declare an npm script `build:local:offline` that additionally sets `BUNDLE_RECOMMENDED_EXTENSIONS=1`, producing a build that includes the bundled-extensions Git cache for the catalog's extension tier.

#### Scenario: Build with recommended extensions
- **WHEN** a developer runs `npm run build:local:offline`
- **THEN** the resulting installer SHALL contain `resources/recommended-extensions/`
- **AND** the wizard's catalog SHALL show the extension tier populated with the bundled extensions

### Requirement: clean:resources script
The `packages/electron/package.json` SHALL declare an npm script `clean:resources` that removes the build outputs `resources/server`, `resources/node`, and `resources/offline-packages`. This SHALL be the canonical way to force a full cache rebuild on the next build:local invocation.

#### Scenario: Clean then rebuild
- **WHEN** a developer runs `npm run clean:resources && npm run build:local`
- **THEN** the build SHALL rebuild every cache from scratch
- **AND** no stale cache from a previous build SHALL persist

### Requirement: Stale-pin invalidation
The local build pipeline SHALL invalidate the offline cacache when `packages/electron/offline-packages.json` has been modified since the cache was last built. The implementation SHALL compare file mtimes between `offline-packages.json` and `resources/offline-packages/manifest.json` and remove the cache directory if the pins file is newer.

#### Scenario: Pins bumped, cache rebuilt
- **WHEN** the user edits `offline-packages.json` to bump a pinned version
- **AND** then runs `npm run build:local`
- **THEN** the build script SHALL detect the mtime mismatch
- **AND** `resources/offline-packages/` SHALL be wiped before the cache rebuild step
- **AND** the new cache SHALL contain the bumped version

#### Scenario: Pins unchanged, cache reused
- **WHEN** `offline-packages.json` is unchanged since the last build
- **AND** the user runs `npm run build:local`
- **THEN** the existing cache SHALL be reused
- **AND** the cache rebuild step SHALL be skipped

### Requirement: Documentation of local-build flow
The `README.md` (or `docs/development.md` if present) SHALL document the local-build workflow: when to use `build:local` vs `build:local:offline` vs `make`, how to invalidate caches, and how to verify the resulting installer is offline-capable.

#### Scenario: Documentation present
- **WHEN** a new contributor searches for "build" in the repo's top-level docs
- **THEN** the documentation SHALL explain the difference between `npm run make` (fast, no caches) and `npm run build:local` (full offline-capable build)
- **AND** the documentation SHALL describe the `clean:resources` workflow for forcing rebuilds
