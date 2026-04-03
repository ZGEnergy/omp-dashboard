## REMOVED Requirements

### Requirement: Runtime dependency on tsx
**Reason**: Replaced by pi's bundled `@mariozechner/jiti` — no separate tsx dependency needed.
**Migration**: Remove `tsx` from `package.json` dependencies. All spawn sites now use `getJitiImportArgs()` from the jiti-loader module.

## ADDED Requirements

### Requirement: Bin entry is plain JavaScript
The package's `bin.pi-dashboard` field SHALL point to `bin/pi-dashboard.mjs`, a plain ESM JavaScript file that resolves the jiti loader path at runtime and re-execs Node with the appropriate `--import` flag and the TypeScript CLI entry point.

#### Scenario: Package bin entry after npm install
- **WHEN** the package is installed via `npm install`
- **THEN** the `pi-dashboard` symlink SHALL point to `bin/pi-dashboard.mjs` which is executable plain JS (no TypeScript loader needed for the wrapper itself)
