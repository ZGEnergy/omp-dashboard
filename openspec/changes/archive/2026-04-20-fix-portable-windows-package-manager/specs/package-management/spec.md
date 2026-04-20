## ADDED Requirements

### Requirement: Pi module resolution
`loadPiPackageManager()` SHALL resolve pi's `DefaultPackageManager` and `SettingsManager` using the following ordered resolution chain:

1. Direct import of `@mariozechner/pi-coding-agent`
2. Managed install at `~/.pi-dashboard/node_modules/{@mariozechner/pi-coding-agent,@oh-my-pi/pi-coding-agent}/dist/index.js`
3. Global npm root via `npm root -g` for both package name variants

The function SHALL return the first successful resolution and cache the result. If all paths fail, it SHALL throw an error with message "pi-coding-agent is not installed."

#### Scenario: Pi found in managed install directory
- **WHEN** direct import fails AND pi is installed at `~/.pi-dashboard/node_modules/@mariozechner/pi-coding-agent/dist/index.js`
- **THEN** `loadPiPackageManager()` resolves successfully and returns `DefaultPackageManager` and `SettingsManager`

#### Scenario: Pi found in managed install under alternate package name
- **WHEN** direct import fails AND `@mariozechner` variant is not in managed install AND `@oh-my-pi/pi-coding-agent` is present in managed install
- **THEN** `loadPiPackageManager()` resolves successfully from the `@oh-my-pi` variant

#### Scenario: Managed install not present falls through to global npm
- **WHEN** direct import fails AND managed install directory does not contain pi
- **THEN** resolution falls through to global npm root check without error

#### Scenario: All resolution paths fail
- **WHEN** direct import, managed install, and global npm all fail
- **THEN** `loadPiPackageManager()` throws an error with message containing "pi-coding-agent is not installed"
