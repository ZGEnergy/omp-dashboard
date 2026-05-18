## ADDED Requirements

### Requirement: Installable.json v2 schema
The `installable.json` file (at `~/.pi/dashboard/installable.json`) SHALL be extended to schema version 2. The envelope SHALL include a `schemaVersion: 2` field (the existing free-form `version` field is preserved for back-compat as a generic version string). Each entry in `packages[]` SHALL support the following optional new field in addition to existing v1 fields (`name`, `version`, `required`, `kind: "npm" | "pi-extension"`, `deprecated`, `defaultOff`): `source: "offline-cache" | "bundled-git" | "npm-registry"`. The existing `kind` field continues to denote install-pathway (npm vs pi-extension manager) and SHALL NOT be repurposed. The "core vs extension" tier distinction used by the wizard catalog SHALL be derived from the existing `required` flag (required=true → core tier; required=false → extension tier).

#### Scenario: v2 file with all new fields
- **WHEN** an `installable.json` file is read with `schemaVersion: 2` and entries containing the new `source` field
- **THEN** the loader SHALL return the parsed records with `source` populated
- **AND** existing v1 fields (`name`, `version`, `required`, `kind`, `defaultOff`, `deprecated`) SHALL remain available unchanged

#### Scenario: v2 file with partial new fields
- **WHEN** a v2 entry omits some optional new fields
- **THEN** the loader SHALL return the entry with the present fields populated
- **AND** absent fields SHALL be undefined (not synthesized with defaults)

### Requirement: v1 → v2 migration
When an `installable.json` file is read with no `schemaVersion` field (legacy v1), the loader SHALL migrate it in memory to v2 by inferring the missing `source` field per entry: `source` is `offline-cache` if the package name is in `ELECTRON_OWNED_PACKAGES`; otherwise `source` is `bundled-git` if `kind == "pi-extension"`; otherwise `source` is `npm-registry`. The `required` field is preserved as-is (already present in v1). The migration SHALL NOT eagerly rewrite the file; rewrite SHALL happen at the next mutation through the normal write path.

#### Scenario: v1 file synthesizes v2 fields in memory
- **WHEN** a v1 file with entries `[{ name: "@earendil-works/pi-coding-agent", kind: "npm", required: true, version: "*" }, { name: "@blackbelt/openspec-tools", kind: "pi-extension", required: false, version: "*" }]` is read
- **THEN** the in-memory representation SHALL have `schemaVersion: 2`
- **AND** the pi-coding-agent entry SHALL have `source: "offline-cache"` (whitelist match)
- **AND** the openspec-tools entry SHALL have `source: "bundled-git"` (pi-extension kind)

#### Scenario: v1 file unchanged on disk after read
- **WHEN** a v1 file is read and no mutation occurs
- **THEN** the file on disk SHALL remain in v1 format
- **AND** no spurious rewrite SHALL occur

#### Scenario: v2 written on first mutation
- **WHEN** a v1 file is read, migrated in memory, and then a mutation triggers a write
- **THEN** the file on disk SHALL be rewritten in v2 format atomically

### Requirement: Catalog assembly from bundled sources
The Electron wizard SHALL display a catalog assembled from two sources: (1) the offline-cache pins read from `packages/electron/offline-packages.json` (or the runtime equivalent at `resources/offline-packages/manifest.json`), classified as `kind: "npm", source: "offline-cache", required: true`; and (2) the bundled-extensions enumerated from the `resources/recommended-extensions/` Git cache, classified as `kind: "pi-extension", source: "bundled-git", required: false`, with `defaultOff` set to the inverse of the `BUNDLED_EXTENSION_IDS` recommended flag.

#### Scenario: Catalog contains core tier
- **WHEN** `assembleCatalog(opts)` is called with a valid resources path
- **THEN** the result SHALL contain one entry per package in `offline-packages.json`
- **AND** each entry SHALL have `kind: "npm"`, `source: "offline-cache"`, `required: true`

#### Scenario: Catalog contains extension tier
- **WHEN** `resources/recommended-extensions/` contains valid extension directories
- **THEN** the result SHALL contain one entry per extension directory found
- **AND** each entry SHALL have `kind: "pi-extension"`, `source: "bundled-git"`, `required: false`
- **AND** the `defaultOff` flag SHALL be set to the inverse of the `BUNDLED_EXTENSION_IDS` recommended-flags mapping (recommended-on → `defaultOff: false`/absent)

#### Scenario: Catalog excludes npm-registry tier
- **WHEN** `assembleCatalog(opts)` is called from the wizard context
- **THEN** the result SHALL NOT include any entry with `source: "npm-registry"`
- **AND** npm-registry discovery SHALL be deferred to Settings → Packages post-install

#### Scenario: Missing resources directory
- **WHEN** `resources/recommended-extensions/` is absent (dev build, opt-out CI)
- **THEN** the assembler SHALL emit an empty extensions section
- **AND** the catalog SHALL still contain the core tier
- **AND** no error SHALL be thrown

### Requirement: Server-side install routing by source
The server-side bootstrap reconciler (`packages/server/src/bootstrap-install-from-list.ts`) SHALL route each package install operation by its `source` field: `offline-cache` packages use the existing offline cacache + `npm install --offline` path; `bundled-git` packages use pi's `DefaultPackageManager` pointed at the bundled Git cache; `npm-registry` packages use a live `npm install` from the public registry.

#### Scenario: Mixed-source installable.json
- **WHEN** the reconciler processes an `installable.json` with entries spanning multiple sources
- **THEN** each entry SHALL be routed to the correct install path according to its `source` field
- **AND** progress reporting SHALL include a source-tagged label (e.g. "[offline] pi-coding-agent installing")

#### Scenario: Unknown source value
- **WHEN** an entry contains a `source` value not in the enum
- **THEN** the entry SHALL be skipped with a warning log line
- **AND** the reconciler SHALL continue processing remaining entries
