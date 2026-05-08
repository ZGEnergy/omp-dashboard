## ADDED Requirements

### Requirement: Publish ordering places client-utils before markdown-content before dependent plugins

The release workflow (`.github/workflows/publish.yml`) SHALL publish the new workspace packages in dependency order:

1. `@blackbelt-technology/pi-dashboard-client-utils` (depends only on `pi-dashboard-shared`)
2. `@blackbelt-technology/pi-dashboard-markdown-content` (depends on `client-utils`)
3. Plugin packages that consume them: `@blackbelt-technology/pi-dashboard-flows-plugin`, `@blackbelt-technology/pi-dashboard-jj-plugin`

Any future workspace that adds a dependency on either new package SHALL be added to the dependents list and SHALL be ordered after both `client-utils` AND `markdown-content` in the publish step.

The `publish-workflow-contract.test.ts` SHALL pin this ordering by parsing the workflow YAML and asserting that:
- `client-utils` appears before `markdown-content`
- `markdown-content` appears before `flows-plugin`
- `client-utils` appears before `jj-plugin`

#### Scenario: Workflow YAML lists packages in dependency order

- **WHEN** reading `.github/workflows/publish.yml` and locating the publish step's package ordering list
- **THEN** `@blackbelt-technology/pi-dashboard-client-utils` SHALL appear at an earlier index than `@blackbelt-technology/pi-dashboard-markdown-content`
- **AND** `@blackbelt-technology/pi-dashboard-markdown-content` SHALL appear earlier than `@blackbelt-technology/pi-dashboard-flows-plugin`
- **AND** `@blackbelt-technology/pi-dashboard-client-utils` SHALL appear earlier than `@blackbelt-technology/pi-dashboard-jj-plugin`

#### Scenario: Contract test enforces ordering

- **WHEN** running `npm test -- publish-workflow-contract.test.ts`
- **THEN** the test SHALL pass when both new packages precede their dependents in the workflow
- **AND** SHALL fail when the order is reversed or either package is omitted from the list

## MODIFIED Requirements

### Requirement: A sync-versions script keeps inter-package dep specifiers aligned

The repository SHALL provide a `scripts/sync-versions.js` helper that, given a lockstep-bumped monorepo, rewrites every inter-package dependency specifier in every workspace `package.json` to `^<current-version>`. It SHALL be invoked as part of any version bump in the release flow, after `npm version -ws --include-workspace-root`.

The script SHALL preserve any existing dependency specifier that is NOT a parseable semver caret range (e.g. `"*"`, `"latest"`, a git URL, a tarball URL, or a `file:` reference). Such specifiers represent a deliberate human override (e.g. a hotfix pin for a yet-to-be-released package) and SHALL NOT be silently rewritten to `^<version>`. The script SHALL log a warning naming each preserved specifier so the human reviewer can confirm intent.

This requirement was implemented in commit `80c99ce` (Layer 1) — `scripts/sync-versions-spec.js` extracts the pure classifier `isRewritableSemverSpec`, and `scripts/sync-versions.js` consumes it. The classifier accepts plain/caret/tilde with optional prerelease and build metadata; everything else is preserved.

#### Scenario: Script exists and is executable

- **WHEN** listing `scripts/sync-versions.js`
- **THEN** the file SHALL exist
- **AND** it SHALL be a valid Node.js ES module or CommonJS script with no runtime dependencies beyond Node built-ins

#### Scenario: Script verifies lockstep versioning

- **WHEN** the script is invoked while any `packages/*/package.json` version differs from the root `package.json` version
- **THEN** the script SHALL exit non-zero with an error indicating lockstep violation
- **AND** no `package.json` file SHALL be modified

#### Scenario: Script rewrites inter-package dep specifiers

- **WHEN** every workspace and the root share version `X.Y.Z` and the script is invoked
- **THEN** every `dependencies` or `devDependencies` entry whose name matches a known `@blackbelt-technology/pi-dashboard-*` workspace AND whose existing specifier is a parseable semver caret range SHALL be rewritten to `^X.Y.Z`
- **AND** no other fields in any `package.json` SHALL be modified

#### Scenario: Script preserves non-semver specifiers

- **WHEN** every workspace and the root share version `X.Y.Z` and a `package.json` declares `"@blackbelt-technology/pi-dashboard-flows-plugin": "*"`
- **THEN** the script SHALL leave the `"*"` specifier unchanged
- **AND** the script SHALL emit a warning to stderr naming the package, the dependent file, and the preserved specifier
- **AND** the script SHALL exit zero

#### Scenario: Script preserves git URL specifiers

- **WHEN** a `package.json` declares `"@blackbelt-technology/pi-dashboard-shared": "github:owner/repo#sha"`
- **THEN** the script SHALL leave the git URL unchanged
- **AND** the script SHALL emit a warning naming the preserved specifier

#### Scenario: Script is a no-op when already in sync

- **WHEN** the script is invoked after a fresh bump + sync, with no intermediate changes and no non-semver specifiers present
- **THEN** the script SHALL exit zero
- **AND** no files SHALL be written
