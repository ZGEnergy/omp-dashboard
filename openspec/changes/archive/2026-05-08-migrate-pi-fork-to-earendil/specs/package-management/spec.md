## MODIFIED Requirements

### Requirement: Pi module resolution

`loadPiPackageManager()` SHALL resolve pi's `DefaultPackageManager` and `SettingsManager` using the following ordered resolution chain. Each step tries the primary fork name first (`@earendil-works/pi-coding-agent`) and falls back to the legacy fork name (`@mariozechner/pi-coding-agent`) before moving to the next step. The function SHALL NOT probe `@oh-my-pi/pi-coding-agent`.

1. Direct import — first `@earendil-works/pi-coding-agent`, then `@mariozechner/pi-coding-agent`.
2. Managed install — `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/dist/index.js`, then `~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent/dist/index.js`.
3. Global npm root via `npm root -g` — first the earendil package, then the mariozechner package.

The function SHALL return the first successful resolution and cache the result. If all paths fail, it SHALL throw an error with message "pi-coding-agent is not installed."

#### Scenario: Pi found in earendil global install (preferred)

- **WHEN** `@earendil-works/pi-coding-agent` is installed globally
- **AND** `@mariozechner/pi-coding-agent` is NOT installed
- **THEN** `loadPiPackageManager()` resolves successfully via the earendil direct-import or managed-install path
- **AND** the legacy fork is never probed

#### Scenario: Pi found in legacy global install (fallback)

- **WHEN** only `@mariozechner/pi-coding-agent` is installed globally
- **THEN** the earendil probe fails fast (one ENOENT) and the mariozechner probe succeeds
- **AND** `loadPiPackageManager()` returns the resolved managers without surfacing the earendil failure

#### Scenario: Pi found in managed install directory (preferred fork)

- **WHEN** direct import fails
- **AND** pi is installed at `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/dist/index.js`
- **THEN** `loadPiPackageManager()` resolves successfully and returns `DefaultPackageManager` and `SettingsManager`

#### Scenario: Pi found in managed install under legacy fork name

- **WHEN** direct import fails
- **AND** the earendil variant is not in the managed install
- **AND** `@mariozechner/pi-coding-agent` is present in the managed install
- **THEN** `loadPiPackageManager()` resolves successfully from the mariozechner variant

#### Scenario: Both forks present in managed install

- **WHEN** both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` are installed under `~/.pi-dashboard/node_modules/`
- **THEN** the resolver SHALL pick `@earendil-works/pi-coding-agent` (the order-first probe)
- **AND** the legacy fork SHALL remain on disk untouched

#### Scenario: Managed install not present falls through to global npm

- **WHEN** direct import fails AND managed install directory does not contain pi
- **THEN** resolution falls through to global npm root check without error

#### Scenario: All resolution paths fail

- **WHEN** direct import, managed install, and global npm all fail for both fork names
- **THEN** `loadPiPackageManager()` throws an error with message containing "pi-coding-agent is not installed"

#### Scenario: oh-my-pi install ignored

- **WHEN** only `@oh-my-pi/pi-coding-agent` is installed
- **THEN** `loadPiPackageManager()` SHALL throw "pi-coding-agent is not installed"
- **AND** the dashboard SHALL surface the install hint for `@earendil-works/pi-coding-agent`

## REMOVED Requirements

### Requirement: oh-my-pi fork supported in resolution chain

**Reason**: The `@oh-my-pi/pi-coding-agent` fork is no longer published or supported. Probing for it added a dead alias to every resolution attempt.

**Migration**: Users with `@oh-my-pi/pi-coding-agent` installed SHALL receive a "pi-coding-agent is not installed" error from the dashboard with a hint to install one of the supported forks. There is no automatic remediation — uninstall oh-my-pi and install earendil or mariozechner.
