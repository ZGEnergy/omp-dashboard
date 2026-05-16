## ADDED Requirements

### Requirement: Optional `bundleSource` field decouples runtime install from bundling

`RecommendedExtension` SHALL declare an optional `bundleSource?: string`
field carrying a git URL used only by the Electron offline-bundling
pipeline (build script + first-launch activation). Runtime install
continues to use `source`.

#### Scenario: bundleSource required for non-git bundled entries

- **GIVEN** an id in `BUNDLED_EXTENSION_IDS`
- **AND** the corresponding `source` does NOT start with `https://`, `git@`,
  or `git:` (e.g. `npm:...`)
- **WHEN** `bundle-recommended-extensions.mjs` runs
- **THEN** the script SHALL read `entry.bundleSource ?? entry.source` and
  fail with a clear error if the resolved value is still not a git URL

#### Scenario: bundleSource drives clone target

- **WHEN** `bundle-recommended-extensions.mjs` clones a bundled id
- **THEN** it SHALL clone from `entry.bundleSource ?? entry.source`
- **AND** the directory layout under
  `packages/electron/resources/bundled-extensions/<id>/` SHALL be unchanged
  (still keyed by `id`)

#### Scenario: bundleSource drives first-launch activation

- **WHEN** `installBundledExtensions` activates a bundled extension
- **THEN** it SHALL compute the pi git cache target path by passing
  `entry.bundleSource ?? entry.source` to `parseBundledGitSource`
- **AND** it SHALL call `manager.addSourceToSettings(effectiveSource)` with
  the same effective source so pi addresses the bundled copy by its git URL

### Requirement: Recommended-routes matches both source forms

`GET /api/packages/recommended` SHALL treat an entry as installed / active
when EITHER `source` OR `bundleSource` matches a recorded source string,
so users who installed via either route see the correct UI state.

#### Scenario: User installed via npm — entry shows active

- **GIVEN** `~/.pi/agent/settings.json#packages[]` contains
  `npm:@blackbelt-technology/pi-anthropic-messages`
- **WHEN** the route enriches that entry
- **THEN** `activeInPi` SHALL be `true`

#### Scenario: User installed via Electron bundling — entry shows active

- **GIVEN** `~/.pi/agent/settings.json#packages[]` contains
  `https://github.com/BlackBeltTechnology/pi-anthropic-messages.git`
- **AND** the manifest entry's `source` is now `npm:...`
- **WHEN** the route enriches that entry
- **THEN** `activeInPi` SHALL be `true` (matched via `bundleSource`)

#### Scenario: Metadata fetch falls back to GitHub via bundleSource

- **WHEN** the route enriches an entry whose `source` is `npm:...` but
  the npm registry returns no metadata
- **AND** the entry declares a GitHub `bundleSource`
- **THEN** the route SHALL attempt `fetchGithubPackageJson(owner, repo)`
  using the parsed `bundleSource`

## MODIFIED Requirements

### Requirement: Build-time bundling script

The project SHALL provide
`packages/electron/scripts/bundle-recommended-extensions.mjs` that clones
each id in `BUNDLED_EXTENSION_IDS` into
`packages/electron/resources/bundled-extensions/<id>/` before
`bundle-server` runs.

#### Scenario: Opt-in via env var

- **WHEN** the script runs with `BUNDLE_RECOMMENDED_EXTENSIONS` unset or
  not equal to `1`
- **THEN** it SHALL exit 0 without writing any files

#### Scenario: Clone source-only, no node_modules

- **WHEN** the script runs with `BUNDLE_RECOMMENDED_EXTENSIONS=1`
- **THEN** for each id it SHALL clone the repo from
  `entry.bundleSource ?? entry.source` (git sources only) and SHALL NOT
  run `npm install` inside the clone

#### Scenario: Commit SHA recorded

- **WHEN** an extension is bundled
- **THEN** the script SHALL write the resolved commit SHA to
  `resources/bundled-extensions/<id>/.bundled-sha`

#### Scenario: License allowlist enforcement

- **WHEN** an extension is cloned
- **THEN** the script SHALL read its `LICENSE` file or `package.json#license`
  and fail the build if the detected SPDX identifier is not in the
  hard-coded allowlist (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC)

#### Scenario: Non-git effective source rejected

- **WHEN** an id in `BUNDLED_EXTENSION_IDS` resolves to an effective
  source (`entry.bundleSource ?? entry.source`) that is not a git URL
- **THEN** the script SHALL fail with a clear error directing the maintainer
  to add a `bundleSource` git URL to the manifest entry

### Requirement: Bundled extension manifest

The system SHALL declare the set of pi extensions that ship inside the
Electron installer via a single exported constant `BUNDLED_EXTENSION_IDS`
in `packages/shared/src/recommended-extensions.ts`. Every id in this list
MUST also appear in `RECOMMENDED_EXTENSIONS`.

#### Scenario: Manifest is the single source of truth

- **WHEN** a build script or runtime installer needs to enumerate bundled
  extensions
- **THEN** it SHALL import `BUNDLED_EXTENSION_IDS` from
  `packages/shared/src/recommended-extensions.ts` and not hard-code the list
  anywhere else

#### Scenario: Bundled id must be a recommended id

- **WHEN** `BUNDLED_EXTENSION_IDS` contains an id not present in
  `RECOMMENDED_EXTENSIONS`
- **THEN** a test in `packages/shared/src/__tests__/` SHALL fail at build
  time

#### Scenario: Initial bundled set after npm-publish migration

- **WHEN** the manifest is evaluated post-migration
- **THEN** `BUNDLED_EXTENSION_IDS` SHALL contain exactly
  `["pi-anthropic-messages", "pi-flows"]`
- **AND** both corresponding entries SHALL have `source: "npm:..."` AND
  `bundleSource: "https://github.com/BlackBeltTechnology/<id>.git"`
