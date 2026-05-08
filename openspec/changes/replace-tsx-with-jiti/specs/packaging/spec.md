## ADDED Requirements

### Requirement: Bin entry is plain JavaScript wrapper
The package's `bin.pi-dashboard` field SHALL point to `bin/pi-dashboard.mjs`, a plain ESM JavaScript file that resolves a TypeScript loader at runtime (jiti via `resolveJitiImport()`, with tsx as a fallback) and re-execs Node with the appropriate `--import` flag and the TypeScript CLI entry point.

#### Scenario: Package bin entry after npm install
- **WHEN** the package is installed via `npm install`
- **THEN** the `pi-dashboard` symlink SHALL point to `bin/pi-dashboard.mjs`, an executable plain JS file that requires no TypeScript loader to parse itself

#### Scenario: Wrapper resolves jiti when pi is on PATH
- **WHEN** the user runs `pi-dashboard <args>` and pi is reachable
- **THEN** the wrapper SHALL resolve jiti via `resolveJitiImport()` and exec `node --import <jiti-path> cli.ts <args>`

#### Scenario: Wrapper falls back to tsx without pi
- **WHEN** the user runs `pi-dashboard <args>` in an environment where `resolveJitiImport()` throws (no pi installation reachable)
- **THEN** the wrapper SHALL resolve tsx's `esm/index.mjs` via `createRequire` and exec `node --import <tsx-path> cli.ts <args>`

### Requirement: Tsx retained as fallback loader
The package SHALL retain `tsx` as a runtime dependency to serve as a fallback TypeScript loader when pi's jiti is not reachable (e.g. Electron managed install before pi is installed, or standalone CLI use without pi on PATH).

#### Scenario: Tsx remains in dependencies
- **WHEN** inspecting `package.json` dependencies after this change
- **THEN** `tsx` SHALL still be listed as a runtime dependency
