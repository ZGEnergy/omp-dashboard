## ADDED Requirements

### Requirement: Whitelist single source of truth
The repository SHALL declare a single source of truth for "Electron-owned" packages — the set of npm packages that the Electron app installs into `~/.pi-dashboard/node_modules/` and considers safe to wipe and reinstall. The whitelist SHALL be exported as `ELECTRON_OWNED_PACKAGES: ReadonlySet<string>` from `packages/shared/src/managed-package-whitelist.ts`.

#### Scenario: Whitelist importable from shared package
- **WHEN** a consumer imports `ELECTRON_OWNED_PACKAGES` from the shared package
- **THEN** the import SHALL resolve to a `ReadonlySet<string>` containing the current Electron-bundled package names

#### Scenario: Whitelist immutable at runtime
- **WHEN** any consumer attempts to mutate the imported set
- **THEN** the mutation SHALL fail (the constant is exposed as `ReadonlySet`, not `Set`)

### Requirement: Whitelist parity with offline-packages.json
A regression test SHALL enforce that the `ELECTRON_OWNED_PACKAGES` set is equal to the `packages[].name` values declared in `packages/electron/offline-packages.json`. Adding a package to one side without the other SHALL cause the test to fail with a clear error message identifying the drift.

#### Scenario: Whitelist matches offline pins
- **WHEN** the regression test runs
- **THEN** it SHALL load the whitelist and parse `offline-packages.json`
- **AND** it SHALL assert the two sets are equal
- **AND** when they differ, the failure message SHALL list which entries are only on each side

#### Scenario: Adding a package to offline-packages.json without whitelist update
- **WHEN** `offline-packages.json` declares a new package not in `ELECTRON_OWNED_PACKAGES`
- **THEN** the regression test SHALL fail
- **AND** the failure SHALL not be silenced or marked as expected

### Requirement: Whitelist consumers
Every reinstall, force-reinstall, and inventory-diff code path SHALL consult the whitelist as its definition of "Electron-owned." Packages outside the whitelist SHALL NEVER be wiped, reinstalled, or version-checked by Electron-owned recovery logic.

#### Scenario: planSafeWipe consults whitelist
- **WHEN** `planSafeWipe(managedDir)` is called
- **THEN** for every entry under `node_modules/`, classification (wipe vs preserve) SHALL be determined by membership in `ELECTRON_OWNED_PACKAGES`

#### Scenario: Preflight inventory consults whitelist
- **WHEN** `readManagedInventory(managedDir)` is called
- **THEN** the function SHALL iterate `ELECTRON_OWNED_PACKAGES` and read each entry's installed `package.json#version`
- **AND** packages outside the whitelist SHALL NOT appear in the inventory result

#### Scenario: User-installed pi-foo never touched
- **WHEN** a user has manually installed `pi-foo` into `~/.pi-dashboard/node_modules/` (e.g. via `npm install pi-foo` in the managed dir)
- **THEN** `pi-foo` SHALL be classified as preserve by `planSafeWipe`
- **AND** no Electron-owned recovery operation SHALL modify, remove, or reinstall it

### Requirement: Whitelist scope boundary
The whitelist SHALL only enumerate packages installed by Electron via the offline cacache. It SHALL NOT include packages installed by:
- The pi-core updater (`/api/pi-core/update`) — these are reconciled by the server's separate `pi-core-checker`/`pi-core-updater` system
- Pi's `DefaultPackageManager` (extensions, skills, themes from `settings.json#packages[]`)
- User manual `npm install` commands run in `~/.pi-dashboard/`

The bundled Node runtime (`~/.pi-dashboard/node/`) is NOT a whitelist entry; it is handled by `installManagedNode` separately, with its own `.version` marker mechanism.

#### Scenario: pi-model-proxy not in whitelist
- **WHEN** the whitelist is enumerated
- **THEN** packages such as `pi-model-proxy`, `pi-flows-extension`, or any other `pi-*` ecosystem package SHALL NOT appear unless they are also bundled in `offline-packages.json`

#### Scenario: Bundled Node not in whitelist
- **WHEN** the whitelist is enumerated
- **THEN** no entry for `node` or `nodejs` SHALL appear; the managed Node runtime is governed by `installManagedNode` and its `.version` marker, not the whitelist
