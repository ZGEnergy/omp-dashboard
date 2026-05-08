## MODIFIED Requirements

### Requirement: Core package discovery

The server SHALL discover all installed pi ecosystem core packages from both global npm and the managed install directory (`~/.pi-dashboard/node_modules/`) using a strict whitelist of package names. The `pi-*` name-prefix heuristic SHALL NOT be used.

The whitelist consists of:

- `@earendil-works/pi-coding-agent` (primary fork)
- `@mariozechner/pi-coding-agent` (legacy fork retained for backward compatibility)
- `@blackbelt-technology/pi-agent-dashboard`
- `@blackbelt-technology/pi-model-proxy`

The whitelist SHALL NOT include `@oh-my-pi/pi-coding-agent`.

#### Scenario: Global npm packages discovered

- **WHEN** the server runs `npm list -g --depth=0 --json`
- **THEN** it SHALL parse the output and identify pi ecosystem packages by matching ONLY the whitelist above
- **AND** each discovered package SHALL include its installed version from the JSON output

#### Scenario: Non-whitelisted pi-prefixed package ignored

- **WHEN** `npm list -g` includes a package whose name starts with `pi-` (e.g., `pi-agent-browser`, `pi-web-access`) but is NOT in the whitelist
- **THEN** the package SHALL NOT appear in the core discovery result
- **AND** SHALL NOT appear in `GET /api/pi-core/status`

#### Scenario: Legacy oh-my-pi install ignored

- **WHEN** `@oh-my-pi/pi-coding-agent` is present in either global or managed install
- **THEN** it SHALL NOT appear in the discovery result
- **AND** the user SHALL receive no upgrade hint for it (the dashboard does not support that fork)

#### Scenario: Both supported forks present uses earendil

- **WHEN** both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` are present in global npm
- **THEN** both SHALL appear in the discovery result with their respective install sources
- **AND** the dashboard SHALL prefer earendil for runtime resolution (per the package-management spec)

#### Scenario: Managed install packages discovered

- **WHEN** the directory `~/.pi-dashboard/node_modules/` exists
- **THEN** the server SHALL scan it ONLY for packages matching the whitelist by reading each matching `package.json`
- **AND** mark their `installSource` as `"managed"`

#### Scenario: Managed directory does not exist

- **WHEN** `~/.pi-dashboard/node_modules/` does not exist
- **THEN** the server SHALL skip managed scanning without error
- **AND** only return globally installed whitelisted packages

#### Scenario: npm list command fails

- **WHEN** `npm list -g --depth=0 --json` fails or times out (30s)
- **THEN** the server SHALL log a warning and return an empty list for global packages

#### Scenario: Duplicate package in both sources

- **WHEN** a whitelisted package is found in both global npm and managed install
- **THEN** the managed install version SHALL take precedence

### Requirement: Display name mapping

Known core packages SHALL have human-readable display names that distinguish the primary fork from the legacy one.

#### Scenario: Earendil pi-coding-agent gets primary display name

- **WHEN** `@earendil-works/pi-coding-agent` is discovered
- **THEN** its `displayName` SHALL be `"pi (core agent)"`

#### Scenario: Mariozechner pi-coding-agent gets legacy display name

- **WHEN** `@mariozechner/pi-coding-agent` is discovered
- **THEN** its `displayName` SHALL be `"pi (core agent — legacy fork)"`
- **AND** the dashboard UI SHALL surface this label so users can see which fork is active

#### Scenario: Unknown package uses npm name

- **WHEN** a discovered package has no display name mapping
- **THEN** its npm package name SHALL be used as `displayName`

### Requirement: Core package update execution

The server SHALL expose `POST /api/pi-core/update` to update one or more core packages. The endpoint SHALL accept either supported pi fork name in the `packages` array.

#### Scenario: Update earendil global package

- **WHEN** a client calls `POST /api/pi-core/update` with `{ packages: ["@earendil-works/pi-coding-agent"] }` and the package has `installSource: "global"`
- **THEN** the server SHALL run `npm update -g @earendil-works/pi-coding-agent`
- **AND** broadcast progress events via WebSocket

#### Scenario: Update legacy mariozechner global package

- **WHEN** a client calls `POST /api/pi-core/update` with `{ packages: ["@mariozechner/pi-coding-agent"] }` and the package has `installSource: "global"`
- **THEN** the server SHALL run `npm update -g @mariozechner/pi-coding-agent`
- **AND** the legacy fork SHALL be updated in place without being silently swapped to earendil

#### Scenario: Update managed package

- **WHEN** a package has `installSource: "managed"`
- **THEN** the server SHALL run `npm update <pkg>` in the `~/.pi-dashboard/` directory using the discovered package name (earendil or mariozechner)

#### Scenario: Update all packages

- **WHEN** `POST /api/pi-core/update` is called with `{ packages: [] }` or no `packages` field
- **THEN** all packages with `updateAvailable: true` SHALL be updated sequentially

#### Scenario: Concurrent operation blocked

- **WHEN** a package operation (extension install/update or core update) is already running
- **THEN** the server SHALL return 409 Conflict

#### Scenario: Permission error on global update

- **WHEN** `npm update -g` fails with a permission error
- **THEN** the error message SHALL be surfaced to the client

### Requirement: piCompatibility block tracks current upstream pi-coding-agent

The `packages/server/package.json` `piCompatibility` block SHALL declare a `recommended` version that is no more than one minor release behind the latest published `@earendil-works/pi-coding-agent` and a `minimum` version that matches the version actually exercised in the dashboard's tests and bundled offline cache.

When the bundled offline cache still pins the legacy `@mariozechner/pi-coding-agent` build (transitional state), the `minimum` SHALL match that legacy version; the `recommended` SHALL still track the earendil release stream so the upgrade-hint UI surfaces forward-progress.

#### Scenario: Recommended tracks earendil even when offline cache is legacy

- **WHEN** the bundled offline cache pins `@mariozechner/pi-coding-agent@0.70.0`
- **AND** the latest published `@earendil-works/pi-coding-agent` is `0.74.0`
- **THEN** `piCompatibility.minimum` SHALL be `"0.70.0"` (matching the offline cache)
- **AND** `piCompatibility.recommended` SHALL be no more than one minor behind `0.74.0` (e.g., `"0.73.0"` or `"0.74.0"`)

#### Scenario: Recommended tracks earendil when both forks publish in lockstep

- **WHEN** both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` publish `0.74.0`
- **THEN** `piCompatibility.recommended` MAY be set to `"0.74.0"` and the dashboard SHALL accept either fork at that version

## REMOVED Requirements

### Requirement: Discovery whitelist includes oh-my-pi fork

**Reason**: The `@oh-my-pi/pi-coding-agent` fork is no longer published or supported. Discovering it produced upgrade hints for an unmaintained package.

**Migration**: Users with `@oh-my-pi/pi-coding-agent` installed SHALL see no entry in `GET /api/pi-core/versions` for that package. They are expected to migrate to `@earendil-works/pi-coding-agent` (preferred) or `@mariozechner/pi-coding-agent` (legacy).
