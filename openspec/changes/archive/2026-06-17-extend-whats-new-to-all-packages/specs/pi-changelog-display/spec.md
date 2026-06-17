# pi-changelog-display (delta)

## MODIFIED Requirements

### Requirement: Changelog REST endpoint
The server SHALL expose `GET /api/pi-core/changelog` returning structured
release entries between two versions for any installed package whose `pkg`
query param is a syntactically valid npm package name.

#### Scenario: Successful range query
- **WHEN** the client sends `GET /api/pi-core/changelog?pkg=@earendil-works/pi-coding-agent&from=0.62.0&to=0.70.0`
- **AND** the package is installed AND its `CHANGELOG.md` is readable
- **THEN** the server SHALL respond `200` with a JSON body containing `pkg`, `from`, `to`, `releases[]` (latest first), `hasBreaking`, `changelogUrl`, and `parsedAt`
- **AND** `releases[]` SHALL contain only entries whose version falls in the half-open interval `(from, to]`

#### Scenario: hasBreaking derived from releases
- **WHEN** any release in the filtered list has a non-empty `breaking[]`
- **THEN** `hasBreaking` SHALL be `true`
- **AND** otherwise `false`

#### Scenario: Malformed package name rejected
- **WHEN** the client sends a `pkg` query param that is not a valid npm package name (empty, contains path separators `/` beyond a single scope slash, contains `..`, or otherwise fails the npm name grammar)
- **THEN** the server SHALL respond `400` with a JSON error
- **AND** SHALL NOT read any filesystem path derived from the user input

#### Scenario: Any valid non-core package accepted
- **WHEN** the client sends a `pkg` that is a valid npm name but not a pi core package (e.g. `pi-web-access`)
- **THEN** the server SHALL NOT reject on the basis of the name being absent from any core-package list
- **AND** SHALL attempt to locate that package's `CHANGELOG.md` via the standard node_modules resolution

#### Scenario: Package not installed or no CHANGELOG returns empty
- **WHEN** the requested package is a valid npm name BUT its `CHANGELOG.md` cannot be located (not installed, or installed without a root CHANGELOG)
- **THEN** the server SHALL respond `200` with `releases: []`, `hasBreaking: false`, `changelogUrl: null`
- **AND** SHALL NOT respond `404`

#### Scenario: Missing or invalid version range
- **WHEN** the client omits `from` or `to`, or provides versions that are not parseable semver
- **THEN** the server SHALL respond `400` with a JSON error

#### Scenario: Endpoint gated by bootstrap status
- **WHEN** `bootstrapState.status !== "ready"`
- **THEN** the server SHALL respond `503` (mirroring the gate that protects other `/api/pi-core/*` routes)

#### Scenario: Cache hit on identical request
- **WHEN** the same request is made twice within 60 seconds
- **AND** the underlying `CHANGELOG.md` mtime has not changed
- **THEN** the second request SHALL be served from cache without re-parsing

#### Scenario: Cache invalidated by core update
- **WHEN** a `pi-core` update completes successfully via `POST /api/pi-core/update`
- **THEN** the changelog cache for the updated package SHALL be cleared
- **AND** the next `GET /api/pi-core/changelog` request for that package SHALL re-parse from disk

## ADDED Requirements

### Requirement: What's-New icon for all updatable packages
The client SHALL render the What's-New affordance for every installed package
row that has an update available, not only the pi core package.

#### Scenario: Updatable package with a CHANGELOG shows the icon
- **WHEN** a package row reports `updateAvailable` true with distinct current/latest versions
- **AND** the changelog query for that package returns at least one release
- **THEN** the row SHALL render the What's-New icon wired to open `WhatsNewDialog` for that package

#### Scenario: Updatable package without a CHANGELOG shows no icon
- **WHEN** a package row reports an available update
- **AND** the changelog query returns `releases: []` (no locatable CHANGELOG)
- **THEN** the row SHALL render no What's-New icon
- **AND** SHALL surface no warning, error, or toast

#### Scenario: Non-updatable package shows no icon
- **WHEN** a package row has no available update
- **THEN** the client SHALL NOT issue a changelog query for that package
- **AND** SHALL render no What's-New icon
