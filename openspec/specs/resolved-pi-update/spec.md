# resolved-pi-update Specification

## Purpose
Anchor every pi update operation to the exact pi install the dashboard bridge/keeper spawns, classify that install, and choose the correct update method (resolved-pi self-update, in-place package-manager install, or honest manual instruction) so the dashboard never updates a pi it does not run.

## Requirements

### Requirement: Updates target only the bridge-resolved pi

Every pi update operation SHALL act on the exact pi the dashboard bridge/keeper spawns — the install resolved by `ToolRegistry.resolveExecutor("pi")` and `realpathSync`'d. The dashboard SHALL NOT update a different pi install (e.g. a global pi) when the bridge resolves a different one. Classification and update commands SHALL be derived from that single realpath'd location.

#### Scenario: Bridge-resolved pi is the update target
- **WHEN** the dashboard updates pi
- **THEN** the install acted upon SHALL be the realpath of `ToolRegistry.resolveExecutor("pi").path` (the binary the keeper spawns)
- **AND** SHALL NOT be inferred from `npm list -g` or any install the bridge does not use

#### Scenario: Multiple pi installs present
- **WHEN** both a global pi and a repo-local pi exist and the bridge resolves the repo-local one
- **THEN** the update SHALL target the repo-local install, not the global one

### Requirement: Install classification drives the update method

The dashboard SHALL classify the bridge-resolved pi install (by realpath path markers, mirroring pi's `detectInstallMethod` and qwen-code's `getInstallationInfo`) into a method + scope + writability, and SHALL choose the update action per that classification. Classification SHALL distinguish: npm/pnpm/yarn/bun **global**; npm/pnpm/yarn/bun **local** (project / workspace / managed `~/.pi-dashboard`); transient runners (npx/pnpx/bunx); bun compiled binary; Homebrew; source/git checkout; read-only bundle (Electron); and unknown.

#### Scenario: Global package-manager install
- **WHEN** the resolved pi is under a package manager's GLOBAL root (npm/pnpm/yarn/bun)
- **THEN** the update SHALL delegate to `pi update --self` (pi emits the correct `-g` command for that manager)

#### Scenario: Managed or simple-local writable install
- **WHEN** the resolved pi lives in a writable `~/.pi-dashboard` managed tree OR a simple (non-workspace) local `node_modules`
- **THEN** the dashboard SHALL run the prefix's package manager install in place (`npm install --ignore-scripts` / `pnpm|yarn|bun add --ignore-scripts` of `<pkg>@latest`, `cwd` = the owning prefix)
- **AND** the package manager SHALL be resolved per the `packageManager` field / lockfile walk-up

#### Scenario: Workspace / monorepo checkout is NOT auto-updated in place
- **WHEN** the resolved pi is a dependency of a workspace root (a `package.json` with a `workspaces` field above the install prefix) and is not the managed tree
- **THEN** the dashboard SHALL NOT run a plain in-place install
- **AND** SHALL report `updatable: false` with `updateMethod: "workspace"` and a `manualAction` instructing the user to bump the binding version ranges and reinstall
- **AND** the rationale is that a plain `npm install <pkg>@latest` cannot reliably bump a workspace-pinned dependency: npm errors (ERESOLVE), crashes (`--legacy-peer-deps` → `reading 'spec'`), or no-ops (`--force` keeps the locked version), and `^0.x` ranges are minor-locked

#### Scenario: Workspace update — chosen one-click design (auto-bump pins)
- **WHEN** a one-click workspace update is offered
- **THEN** it SHALL be implemented as: edit EVERY binding `@earendil-works/pi-coding-agent` range (the non-`*` ranges — root `peerDependencies` + `packages/server` `dependencies`) to admit the target version, then run `npm install --ignore-scripts`
- **AND** the UI SHALL preview the exact file diffs before applying and offer an Undo after (the action mutates tracked source + lockfile)
- **AND** the dashboard SHALL NOT use `--force` or `--legacy-peer-deps` (false-success / npm-crash)

#### Scenario: Transient runner
- **WHEN** the resolved pi path indicates npx/pnpx/bunx (e.g. `/_npx`, `/.bun/install/cache`)
- **THEN** the dashboard SHALL NOT attempt an update and SHALL report it is transient (not applicable)

#### Scenario: bun compiled binary
- **WHEN** the resolved pi is a bun compiled binary (`bun-binary`)
- **THEN** the dashboard SHALL refuse and instruct downloading the latest release

#### Scenario: Homebrew install
- **WHEN** the resolved pi is a Homebrew install
- **THEN** the dashboard SHALL refuse and instruct `brew upgrade`

#### Scenario: Source / git checkout
- **WHEN** the resolved pi runs from a git checkout outside `node_modules`
- **THEN** the dashboard SHALL refuse and instruct `git pull` / rebuild

#### Scenario: Read-only or unknown
- **WHEN** the resolved install path is not writable (e.g. Electron bundle) or the method is unknown
- **THEN** the dashboard SHALL refuse and name the location, instructing the user to update the app / provider

### Requirement: Single pi resolution authority for spawn, stats, and update

The dashboard SHALL resolve the pi install once via the same path used to spawn sessions (`ToolResolver.resolvePi()` → `ToolRegistry.resolveExecutor("pi")`) and reuse that single resolution for version display and for update execution. The dashboard SHALL NOT compute a separate install location (e.g. an independent `npm list -g` enumeration) for the pi package's version or update.

#### Scenario: Resolved pi drives the displayed version
- **WHEN** the Pi Ecosystem panel reports the pi package version
- **THEN** the version SHALL be read from the resolved pi install's `package.json` (`pkgRoot/package.json`)
- **AND** SHALL equal the version of the binary the dashboard spawns for sessions

#### Scenario: Resolved pi drives the update target
- **WHEN** the user updates the pi package
- **THEN** the dashboard SHALL act on the resolved pi install, not a separately-enumerated global or managed tree

### Requirement: pi package update delegates to the resolved pi, then falls back to in-place install

The dashboard SHALL update the pi package by first invoking the resolved pi's own updater (`<resolvedPiArgv> update --self`). When pi DECLINES the install (its self-update-unavailable message, e.g. a non-global/source/managed install), the dashboard SHALL fall back to updating pi IN PLACE at its resolved install prefix using the package manager that governs that prefix (`npm install <pkg>@latest`, or `pnpm|yarn|bun add <pkg>@latest`), with the spawn `cwd` set to that prefix. The dashboard SHALL NOT run `npm install -g <pi-pkg>@latest`.

#### Scenario: Update pi only (self-update succeeds)
- **WHEN** the user chooses "Update pi only" and the resolved pi can self-update
- **THEN** the dashboard SHALL spawn the resolved pi argv followed by `update --self`
- **AND** SHALL stream the child's stdout/stderr to the existing progress events
- **AND** SHALL treat a zero exit code as success

#### Scenario: Fallback to in-place install when pi declines
- **WHEN** `pi update --self` exits with the self-update-unavailable message
- **AND** the resolved install prefix is writable
- **THEN** the dashboard SHALL run the prefix's package manager install of `<pkgName>@latest` with `cwd` = the install prefix
- **AND** SHALL treat a zero exit code as success

#### Scenario: Update pi and extensions
- **WHEN** the user chooses the default "Update all"
- **THEN** the dashboard SHALL spawn the resolved pi argv followed by `update --all`

#### Scenario: Restart after successful pi self-update
- **WHEN** a pi self-update (`--self` or `--all`) completes with exit code 0
- **THEN** the dashboard SHALL restart the server (`POST /api/restart`) and reload sessions so subsequent spawns use the updated pi

### Requirement: Read-only pi install refuses with an honest instruction

The in-place fallback SHALL update only when the resolved install path is writable. When the install path is NOT writable (e.g. a packaged/immutable app bundle), the dashboard SHALL NOT attempt an install and SHALL surface an instruction to update the application/package manager that provides it, and SHALL NOT report a successful update.

#### Scenario: Read-only install path
- **WHEN** pi declines self-update AND the resolved install prefix / package dir is not writable
- **THEN** the dashboard SHALL NOT run a package-manager install
- **AND** SHALL return an instruction naming the read-only location (no false success)

#### Scenario: Writability check mirrors pi
- **WHEN** classifying the resolved install
- **THEN** writability SHALL be determined by write access to the package dir AND its parent (the same gate pi uses)

### Requirement: Dashboard package update uses install-layout detection

Because no `pi update` exists for `@blackbelt-technology/pi-agent-dashboard`, the dashboard SHALL update its own package via npm only when the detected install layout supports it, and SHALL otherwise surface the layout-appropriate manual instruction.

#### Scenario: npm-global dashboard install
- **WHEN** `detectInstallLayout()` returns `npm-global`
- **THEN** the dashboard package update SHALL run `npm install -g @blackbelt-technology/pi-agent-dashboard`

#### Scenario: Electron or monorepo dashboard install
- **WHEN** `detectInstallLayout()` returns `electron` or `monorepo`
- **THEN** the dashboard SHALL NOT run an npm update
- **AND** SHALL surface `suggestedReinstallCommand()` (reinstall the app / `npm install` from repo root) instead
