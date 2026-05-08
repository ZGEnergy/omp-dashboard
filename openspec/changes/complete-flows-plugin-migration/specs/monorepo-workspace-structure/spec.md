## ADDED Requirements

### Requirement: client-utils and markdown-content packages are part of the monorepo

The repository's npm workspace layout SHALL include `packages/client-utils/` AND `packages/markdown-content/` as published runtime workspaces. The root `package.json#workspaces` array uses the `"packages/*"` glob, so both directories are auto-discovered without explicit listing.

Both packages SHALL satisfy the existing `monorepo-workspace-structure` requirements applicable to public runtime workspaces:

- Naming convention: `@blackbelt-technology/pi-dashboard-client-utils` and `@blackbelt-technology/pi-dashboard-markdown-content`
- Public access (`publishConfig.access: "public"`)
- Lockstep version with other runtime workspaces
- Plain semver caret ranges for inter-package deps (no `workspace:` protocol)
- Imports use package-name paths internally (no deep relative paths into other workspaces)

#### Scenario: Both packages auto-discovered via workspaces glob

- **WHEN** running `npm install` from the repository root
- **THEN** `node_modules/@blackbelt-technology/pi-dashboard-client-utils` SHALL be a symlink to `packages/client-utils`
- **AND** `node_modules/@blackbelt-technology/pi-dashboard-markdown-content` SHALL be a symlink to `packages/markdown-content`

#### Scenario: Both packages declare lockstep version + public access

- **WHEN** reading both `packages/client-utils/package.json` and `packages/markdown-content/package.json`
- **THEN** both SHALL declare `publishConfig.access: "public"`
- **AND** both SHALL declare `version` matching the root `package.json#version`

### Requirement: markdown-content depends on client-utils, not vice versa

The dependency direction between the two new packages SHALL be one-way: `markdown-content` → `client-utils` (because `MarkdownContent` consumes `DialogPortal` / `useZoomPan` / `ZoomControls` via `ImageLightbox` and `MermaidBlock`).

`client-utils` SHALL NOT depend on `markdown-content`. This direction prevents a circular dependency and keeps `client-utils` light for plugins that don't need markdown rendering.

#### Scenario: markdown-content lists client-utils as a dependency

- **WHEN** reading `packages/markdown-content/package.json#dependencies`
- **THEN** the object SHALL contain `"@blackbelt-technology/pi-dashboard-client-utils": "^X.Y.Z"`

#### Scenario: client-utils does not list markdown-content as a dependency

- **WHEN** reading `packages/client-utils/package.json#dependencies` and `package.json#devDependencies`
- **THEN** neither object SHALL contain `@blackbelt-technology/pi-dashboard-markdown-content`

### Requirement: Cross-package deep imports are forbidden

Source files in any workspace under `packages/` SHALL NOT import from sibling workspaces via paths that escape the importing package's own boundary. Specifically, no source file SHALL contain an import specifier that:

- Starts with `..` and resolves outside the importing package's `src/` directory, AND
- Targets another workspace (i.e. crosses into a different `packages/<name>/` directory)

The single exception is the legacy re-export shims at `packages/client/src/{components,hooks,lib,components/extension-ui}/<file>.tsx` that re-export from `@blackbelt-technology/pi-dashboard-client-utils/<symbol>` or `@blackbelt-technology/pi-dashboard-markdown-content/<symbol>`. These shims use the package-name path (not a deep relative path), so they comply with the rule.

A repository-level lint test SHALL enforce this rule by scanning every `*.ts` and `*.tsx` file under `packages/*/src/` and failing CI when any import specifier matches a cross-package escape pattern.

#### Scenario: Lint passes on a clean repository

- **WHEN** running `npm test` against a checkout where every cross-package import uses package-name paths
- **THEN** the lint test `no-cross-package-deep-imports.test.ts` SHALL pass

#### Scenario: Lint fails on a regression

- **WHEN** a developer adds `import { Foo } from "../../../client/src/components/Foo.js"` to a file under `packages/flows-plugin/src/`
- **THEN** the lint test SHALL fail
- **AND** the failure message SHALL identify the offending file path and the offending specifier

#### Scenario: Lint allows package-name imports

- **WHEN** a file under `packages/flows-plugin/src/` imports `from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell"`
- **THEN** the lint test SHALL NOT flag this import

#### Scenario: Lint allows intra-package relative imports

- **WHEN** a file under `packages/flows-plugin/src/client/` imports `from "./helpers.js"` or `from "../reducer.js"`
- **THEN** the lint test SHALL NOT flag these imports

### Requirement: flows-plugin and jj-plugin depend on the new packages by name

`packages/flows-plugin/package.json` SHALL declare both `@blackbelt-technology/pi-dashboard-client-utils` AND `@blackbelt-technology/pi-dashboard-markdown-content` as runtime `dependencies`.

`packages/jj-plugin/package.json` SHALL declare `@blackbelt-technology/pi-dashboard-client-utils` only as a runtime `dependency` — it does NOT depend on `markdown-content`.

#### Scenario: flows-plugin declares both deps

- **WHEN** reading `packages/flows-plugin/package.json#dependencies`
- **THEN** the object SHALL contain `"@blackbelt-technology/pi-dashboard-client-utils": "^X.Y.Z"`
- **AND** the object SHALL contain `"@blackbelt-technology/pi-dashboard-markdown-content": "^X.Y.Z"`
- **AND** both versions SHALL match the root version

#### Scenario: jj-plugin declares client-utils only

- **WHEN** reading `packages/jj-plugin/package.json#dependencies`
- **THEN** the object SHALL contain `"@blackbelt-technology/pi-dashboard-client-utils": "^X.Y.Z"`
- **AND** the object SHALL NOT contain `"@blackbelt-technology/pi-dashboard-markdown-content"`
