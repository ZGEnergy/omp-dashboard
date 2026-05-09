## ADDED Requirements

### Requirement: Bin entry is plain JavaScript wrapper (jiti-only)
The package's `bin.pi-dashboard` field SHALL point to `bin/pi-dashboard.mjs`, a plain ESM JavaScript file that resolves jiti at runtime via `resolveJitiImport()` and re-execs Node with `--import <jiti-url> packages/server/src/cli.ts <args>`. The wrapper SHALL NOT carry a tsx fallback; on jiti-resolution failure it SHALL exit 1 with an install-hint stderr message.

#### Scenario: Package bin entry after npm install
- **WHEN** the package is installed via `npm install`
- **THEN** the `pi-dashboard` symlink SHALL point to `bin/pi-dashboard.mjs`, an executable plain JS file that requires no TypeScript loader to parse itself

### Requirement: tsx removed from dependencies
The `tsx` package SHALL NOT appear in `dependencies` or `devDependencies` of any workspace `package.json`. `npm ls tsx` SHALL report no resolved entry under any workspace package (transitive shadow-installs by unrelated optional deps are exempt).

#### Scenario: Lockfile audit
- **WHEN** running `npm ls tsx` at the repo root after `npm install`
- **THEN** no workspace package SHALL list `tsx` as a direct dependency
