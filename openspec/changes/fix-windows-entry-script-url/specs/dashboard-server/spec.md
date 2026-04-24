## MODIFIED Requirements

### Requirement: TypeScript loader passed as file:// URL
All call sites that spawn the dashboard server with `node --import <loader> <entry-script>` SHALL pass both the loader argument AND the entry-script argument as `file://` URLs, not raw filesystem paths. This covers the jiti register hook, the tsx fallback, and the entry-script path resolved via `fileURLToPath(import.meta.url)`.

#### Scenario: resolveJitiImport returns file URL
- **WHEN** `resolveJitiImport()` resolves jiti successfully on any platform
- **THEN** the returned string SHALL start with `file://` and SHALL be accepted by `new URL(...)` without throwing

#### Scenario: Electron jiti resolver returns file URL
- **WHEN** `resolveJitiFromAnchor()` in `server-lifecycle.ts` resolves jiti successfully
- **THEN** the returned string SHALL be a `file://` URL

#### Scenario: tsx fallback returns file URL
- **WHEN** `cmdStart` falls back to the tsx loader (jiti resolution failed)
- **THEN** the loader path passed to `--import` SHALL be a `file://` URL

#### Scenario: Entry-script argument is a file:// URL
- **WHEN** any server-spawn call site constructs argv of the form `node --import <loader> <entry> <args...>`
- **THEN** the `<entry>` argument SHALL be a `file://` URL
- **AND** SHALL NOT be a raw filesystem path

#### Scenario: Windows drive-letter loader path no longer crashes
- **WHEN** the loader file lives on a drive whose single-letter prefix collides with URL-scheme parsing (e.g. `B:\...\jiti-register.mjs`) on Windows
- **THEN** `node --import <loader> <entry>` SHALL start the server successfully
- **AND** SHALL NOT produce `ERR_UNSUPPORTED_ESM_URL_SCHEME`

#### Scenario: Windows drive-letter entry-script path no longer crashes
- **WHEN** the dashboard source lives on a drive whose single-letter prefix collides with URL-scheme parsing (e.g. `B:\Dev\...\cli.ts`) on Windows
- **AND** the user invokes `pi-dashboard start`, the bridge auto-starts the server, the Electron app spawns the server, or `POST /api/restart` is called
- **THEN** the spawned Node process SHALL load the entry script successfully
- **AND** SHALL NOT produce `ERR_UNSUPPORTED_ESM_URL_SCHEME`

## ADDED Requirements

### Requirement: Centralized helper for Node ESM-loader argv construction
The repository SHALL expose a helper (`toFileUrl` and `spawnNodeScript` in `packages/shared/src/platform/node-spawn.ts`) that is the canonical way to build argv for `node --import <loader> <entry>` spawns. `toFileUrl` SHALL be pure, idempotent, and correctly wrap Windows drive-letter paths regardless of host OS so the Windows contract can be unit-tested on Linux and macOS. `spawnNodeScript` SHALL wrap both the loader and entry positions with `toFileUrl` before spawning.

#### Scenario: toFileUrl is idempotent on file:// URLs
- **WHEN** `toFileUrl("file:///C:/foo.ts")` is called
- **THEN** the helper SHALL return `"file:///C:/foo.ts"` unchanged

#### Scenario: toFileUrl wraps Windows drive-letter paths on any host
- **WHEN** `toFileUrl("B:\\Dev\\cli.ts")` or `toFileUrl("B:/Dev/cli.ts")` is called on Linux, macOS, or Windows
- **THEN** the helper SHALL return `"file:///B:/Dev/cli.ts"`

#### Scenario: toFileUrl wraps POSIX absolute paths
- **WHEN** `toFileUrl("/usr/local/bin/cli.js")` is called on any host
- **THEN** the helper SHALL return `"file:///usr/local/bin/cli.js"`

#### Scenario: spawnNodeScript wraps both loader and entry
- **WHEN** `spawnNodeScript({ loader, entry, args })` is invoked with raw OS paths
- **THEN** the resulting argv SHALL equal `["--import", toFileUrl(loader), toFileUrl(entry), ...args]`

### Requirement: CI detects raw paths passed to Node ESM loader
The test suite SHALL include a lint-style check that scans the source tree for `spawn(...)` calls whose argv passes `"--import"` or `"--loader"` followed by a raw filesystem path (i.e. not routed through `toFileUrl` or `pathToFileURL`). Violations SHALL fail CI with a message identifying file and line number. This guard mirrors the existing `no-direct-child-process.test.ts` and `no-direct-process-kill.test.ts` patterns and prevents regression when future contributors add a new spawn site.

#### Scenario: Lint passes on the current codebase
- **WHEN** `npm test` is run after the migration
- **THEN** the lint test SHALL report zero violations

#### Scenario: Lint detects a staged violation fixture
- **GIVEN** a test fixture containing `spawn(process.execPath, ["--import", loader, rawPath])` where `rawPath` is not wrapped
- **WHEN** the lint scanner runs against the fixture
- **THEN** the scanner SHALL report the fixture's file and line number as a violation
