## ADDED Requirements

### Requirement: Presence-check gate MUST NOT depend on Node module-resolution
Any code in the dashboard that decides whether a managed npm package is "installed" — for the purpose of skipping a reinstall, gating a wizard, or signalling readiness — SHALL use a direct filesystem check on `<managedDir>/node_modules/<package-name>/package.json`.

The check MUST NOT use `require.resolve(name + "/package.json")` or any other code path that traverses the package's `exports` map. Modern Node packages (including `@earendil-works/pi-coding-agent` and `@fission-ai/openspec`) declare restrictive `exports` maps that omit `./package.json`, causing `require.resolve` to throw `ERR_PACKAGE_PATH_NOT_EXPORTED` even when the package is fully installed.

#### Scenario: Package with restrictive exports map is detected as installed
- **WHEN** `<managedDir>/node_modules/@earendil-works/pi-coding-agent/package.json` exists on disk
- **AND** the package's `exports` map contains only `"."` (no `"./package.json"`)
- **THEN** the presence-check gate SHALL report this package as installed (return true / `status=satisfied`)

#### Scenario: Bootstrap fast-path fires for already-installed packages
- **WHEN** the dashboard server starts and `bootstrapInstallFromList` runs
- **AND** all `installable.json` entries with `kind: "npm"` have their `package.json` present at `<managedDir>/node_modules/<name>/package.json`
- **THEN** the loop SHALL emit `bootstrap.installable.package ... status=satisfied` for each
- **AND** the loop SHALL NOT invoke `npm install` for any of them
- **AND** the total elapsed time for the installable phase SHALL be under 100ms on a warm filesystem

#### Scenario: Wizard re-trigger avoided on every launch
- **WHEN** the Electron app launches with `<managedDir>/node_modules/` populated by every Electron-owned package
- **THEN** `isManagedDirPopulated()` SHALL return true
- **AND** `decideStartupAction()` SHALL return `{ kind: "skip" }` (or `{ kind: "preflight-install" }` only when preflight legitimately reports stale versions)
- **AND** the first-run wizard window SHALL NOT open

### Requirement: Version-pinned presence check matches installed version
When the gate is supplied with an expected version (e.g. from `installable.json`'s `version` field, when set to a concrete version rather than `"*"`), the check SHALL compare the version field of the installed `package.json` to the expected version.

#### Scenario: Pinned version matches installed
- **WHEN** `installable.json` pins `@earendil-works/pi-coding-agent` to `0.74.0`
- **AND** the installed `package.json` declares `"version": "0.74.0"`
- **THEN** the gate SHALL report `status=satisfied`

#### Scenario: Pinned version differs from installed
- **WHEN** `installable.json` pins `@earendil-works/pi-coding-agent` to `0.75.0`
- **AND** the installed `package.json` declares `"version": "0.74.0"`
- **THEN** the gate SHALL report missing/stale
- **AND** the bootstrap loop SHALL invoke `npm install <name>@<version>` for legitimate upgrade

#### Scenario: Corrupt installed package.json
- **WHEN** the installed `package.json` exists but cannot be parsed as JSON
- **THEN** the gate SHALL report the package as missing (false)
- **AND** the bootstrap loop SHALL invoke `npm install` to recover

#### Scenario: Wildcard version skips version comparison
- **WHEN** `installable.json` declares `version: "*"` (or omits the version field)
- **THEN** the gate SHALL perform a presence-only check (no version comparison)
- **AND** the existing `package.json` at any version SHALL be reported as satisfied
