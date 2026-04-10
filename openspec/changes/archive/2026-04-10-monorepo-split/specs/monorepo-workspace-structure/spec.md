## ADDED Requirements

### Requirement: npm workspace layout
The project SHALL be structured as an npm workspaces monorepo with four packages under `packages/`: `shared`, `server`, `extension`, and `client`.

#### Scenario: Workspace root lists all packages
- **WHEN** the root `package.json` is read
- **THEN** `workspaces` field SHALL contain `["packages/*"]`

#### Scenario: Each package has its own package.json
- **WHEN** listing `packages/shared/`, `packages/server/`, `packages/extension/`, `packages/client/`
- **THEN** each directory SHALL contain a `package.json` with its own `name`, `version`, and `dependencies`

### Requirement: Package naming convention
Each package SHALL use the `@blackbelt-technology/pi-dashboard-*` scope:
- `@blackbelt-technology/pi-dashboard-shared`
- `@blackbelt-technology/pi-dashboard-server`
- `@blackbelt-technology/pi-dashboard-extension`
- `@blackbelt-technology/pi-dashboard-web`

#### Scenario: Package names match convention
- **WHEN** reading `packages/*/package.json`
- **THEN** each `name` field SHALL match `@blackbelt-technology/pi-dashboard-{shared,server,extension,web}`

### Requirement: Shared package has zero internal dependencies
The shared package SHALL NOT depend on server, extension, or client packages.

#### Scenario: Shared package.json has no workspace deps
- **WHEN** reading `packages/shared/package.json`
- **THEN** `dependencies` SHALL NOT contain any `@blackbelt-technology/pi-dashboard-*` package

### Requirement: Server, extension, and client depend only on shared
Each non-shared package SHALL depend on `@blackbelt-technology/pi-dashboard-shared` and SHALL NOT depend on other workspace packages.

#### Scenario: Server depends on shared only
- **WHEN** reading `packages/server/package.json`
- **THEN** workspace dependencies SHALL include only `@blackbelt-technology/pi-dashboard-shared`

#### Scenario: Extension depends on shared only
- **WHEN** reading `packages/extension/package.json`
- **THEN** workspace dependencies SHALL include only `@blackbelt-technology/pi-dashboard-shared`

#### Scenario: Client depends on shared only
- **WHEN** reading `packages/client/package.json`
- **THEN** workspace dependencies SHALL include only `@blackbelt-technology/pi-dashboard-shared`

### Requirement: Shared TypeScript base config
A root `tsconfig.base.json` SHALL define shared compiler options. Each package's `tsconfig.json` SHALL extend it.

#### Scenario: Package tsconfigs extend base
- **WHEN** reading `packages/*/tsconfig.json`
- **THEN** each SHALL contain `"extends": "../../tsconfig.base.json"`

### Requirement: Root-level dev scripts work
The root `package.json` SHALL provide scripts that orchestrate across workspaces: `npm test`, `npm run dev`, `npm run build`, `npm run reload`.

#### Scenario: npm test runs all package tests
- **WHEN** running `npm test` from the root
- **THEN** vitest SHALL execute tests from all four packages

#### Scenario: npm run build builds the client
- **WHEN** running `npm run build` from the root
- **THEN** the client package's Vite build SHALL produce output in `packages/client/dist/`

### Requirement: Import paths use package names
All cross-package imports SHALL use the package name (e.g., `@blackbelt-technology/pi-dashboard-shared/types.js`) instead of relative paths (`../shared/types.js`).

#### Scenario: No relative cross-package imports exist
- **WHEN** searching for `from "../shared/"` or `from "../../shared/"` patterns in server, extension, or client source
- **THEN** zero matches SHALL be found

### Requirement: ArchiveEntry type moves to shared
The `ArchiveEntry` type SHALL be defined in the shared package, not the server package.

#### Scenario: Client imports ArchiveEntry from shared
- **WHEN** the client needs the `ArchiveEntry` type
- **THEN** it SHALL import from `@blackbelt-technology/pi-dashboard-shared/archive-types.js`
