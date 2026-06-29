# pi-core-version-check Specification

## Purpose
Server-side discovery and reporting of installed pi ecosystem core package versions so the dashboard can surface version skew and upgrade hints.
## Requirements
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

### Requirement: Version comparison against registry
The server SHALL compare each discovered package's installed version against the latest version available on npm or GitHub.

#### Scenario: npm package version check
- **WHEN** a discovered package is an npm package
- **THEN** the server SHALL fetch its latest version via `fetchPackageMeta()` from the npm registry
- **AND** set `updateAvailable` to `true` when installed version differs from latest

#### Scenario: Registry unreachable
- **WHEN** the npm registry is unreachable for a package
- **THEN** `latestVersion` SHALL be `null` and `updateAvailable` SHALL be `false`

### Requirement: Version status caching
The server SHALL cache version status results for 5 minutes to avoid excessive registry queries.

#### Scenario: Cached result returned
- **WHEN** a version check was performed less than 5 minutes ago
- **THEN** the cached result SHALL be returned without querying the registry

#### Scenario: Force refresh
- **WHEN** `GET /api/pi-core/versions?refresh=true` is called
- **THEN** the cache SHALL be invalidated and a fresh check SHALL be performed

### Requirement: Version status REST endpoint
The server SHALL expose the pi-core version status endpoint returning all discovered core packages, their versions, and update availability. The **pi package's version SHALL be read from the resolved pi install** (`ToolRegistry.resolveExecutor("pi")` → realpath → `package.json`), so the reported version matches the spawned binary. Each package entry SHALL include `updatable` (whether the dashboard can perform the update) and, when not updatable, a `manualAction` instruction string.

#### Scenario: Successful version check
- **WHEN** a client calls `GET /api/pi-core/versions`
- **THEN** the response SHALL contain `{ success: true, data: PiCoreStatus }` with `packages` array, `updatesAvailable` count, and `lastChecked` ISO timestamp

#### Scenario: No packages found
- **WHEN** no pi ecosystem packages are discovered
- **THEN** the response SHALL return an empty `packages` array with `updatesAvailable: 0`

#### Scenario: pi version reflects resolved install
- **WHEN** a client requests pi-core status
- **THEN** the pi package entry's `currentVersion` SHALL equal the version in the resolved pi install's `package.json`

#### Scenario: Non-updatable package carries a manual action
- **WHEN** a discovered package cannot be updated by the dashboard (e.g. source/electron install)
- **THEN** its entry SHALL set `updatable: false`
- **AND** SHALL include a `manualAction` string describing how to update it manually

### Requirement: Status carries the resolved-pi install classification

The pi-core status SHALL include, for the pi row, the classification of the bridge-resolved install so clients can render the correct affordance WITHOUT first attempting (and failing) an update. Fields: `updateMethod` (`pi-self` | `npm` | `pnpm` | `yarn` | `bun`), `updateScope` (`global` | `local`), `updatable` (boolean), and `manualAction` (instruction string when not updatable). These derive from the realpath'd resolved pi.

#### Scenario: Local writable install is updatable
- **WHEN** the resolved pi is a writable local/managed install
- **THEN** the pi row SHALL report `updatable: true` and a local `updateMethod`/`updateScope`

#### Scenario: Transient / read-only install is not updatable
- **WHEN** the resolved pi is npx/bunx, a bun binary, Homebrew, a git checkout, or a read-only bundle
- **THEN** the pi row SHALL report `updatable: false` with a class-specific `manualAction`

### Requirement: Core package update execution

The server SHALL execute a core-package update on demand. For the **pi package**, the server SHALL delegate to the resolved pi's own updater (`<resolvedPiArgv> update --self` or `--all`) rather than running `npm install -g <pi-pkg>@latest`. For the **dashboard package** (`@blackbelt-technology/pi-agent-dashboard`), which has no `pi update` equivalent, the server SHALL run an npm install only when the detected install layout supports it, otherwise surface the layout-appropriate manual instruction. Updates SHALL serialize through the existing busy lock.

#### Scenario: Update pi via resolved pi self-update
- **WHEN** an update is requested for the pi package
- **THEN** the server SHALL spawn the resolved pi argv followed by `update --self`
- **AND** SHALL NOT spawn `npm install -g <pi-pkg>@latest`
- **AND** SHALL stream child stdout/stderr to update-progress events

#### Scenario: Update pi and extensions together
- **WHEN** an "all" update is requested
- **THEN** the server SHALL spawn the resolved pi argv followed by `update --all`

#### Scenario: pi self-update declined → in-place fallback
- **WHEN** `pi update --self` exits with the self-update-unavailable message
- **AND** the resolved install prefix is writable
- **THEN** the server SHALL run the prefix's package-manager install of `<pkg>@latest` at that prefix
- **AND** report success on exit 0

#### Scenario: pi self-update declined → read-only install
- **WHEN** `pi update --self` is declined AND the resolved install path is not writable
- **THEN** the server SHALL return an instruction naming the read-only location and SHALL NOT report success

#### Scenario: Update dashboard package on npm-global layout
- **WHEN** an update is requested for `@blackbelt-technology/pi-agent-dashboard`
- **AND** `detectInstallLayout()` returns `npm-global`
- **THEN** the server SHALL run `npm install -g @blackbelt-technology/pi-agent-dashboard`

#### Scenario: Update dashboard package refused on electron/monorepo layout
- **WHEN** an update is requested for the dashboard package
- **AND** `detectInstallLayout()` returns `electron` or `monorepo`
- **THEN** the server SHALL NOT run npm
- **AND** SHALL return `suggestedReinstallCommand()` as the instruction

#### Scenario: Concurrent operation blocked
- **WHEN** an update is requested while another package operation is in progress
- **THEN** the server SHALL reject with a busy error and SHALL NOT start a second operation

### Requirement: Session auto-reload after update
The server SHALL auto-reload all connected pi sessions after a successful core package update.

#### Scenario: Successful update triggers reload
- **WHEN** a core package update completes successfully
- **THEN** all connected pi sessions SHALL be reloaded
- **AND** the completion message SHALL include `sessionsReloaded` count

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

### Requirement: piCompatibility block tracks current upstream pi-coding-agent

The `packages/server/package.json` `piCompatibility` block SHALL declare a `recommended` version that is no more than one minor release behind the latest published `@earendil-works/pi-coding-agent` and a `minimum` version that matches the version actually exercised in the dashboard's tests and the bundled-extensions peer-dep constraints in `packages/electron/resources/bundled-extensions/*/package.json`.

The legacy offline-cache (`packages/electron/offline-packages.json`) was removed under change `eliminate-electron-runtime-install`; bundled-extension peer-deps are now the sole pin surface that must move in lockstep with `piCompatibility.minimum`.

#### Scenario: Recommended tracks earendil 0.78 line

- **WHEN** the latest published `@earendil-works/pi-coding-agent` is `0.78.0`
- **AND** every bundled-extension `package.json` declares peer-dep `@earendil-works/pi-coding-agent` at `>=0.78.0` (or `^0.78.0`)
- **THEN** `piCompatibility.minimum` SHALL be `"0.78.0"`
- **AND** `piCompatibility.recommended` SHALL be `"0.78.0"`

#### Scenario: Recommended moves ahead of floor when a 0.78 patch ships

- **WHEN** `@earendil-works/pi-coding-agent@0.78.1` is published
- **AND** the dashboard wants to surface the soft upgrade hint without raising the hard floor
- **THEN** `piCompatibility.recommended` MAY be lifted to `"0.78.1"` while `piCompatibility.minimum` stays at `"0.78.0"`
- **AND** users on `0.78.0` SHALL see `upgradeRecommended: true` but no `compatibility.error`

#### Scenario: Recommended tracks earendil when both forks publish in lockstep

- **WHEN** both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` publish `0.78.0`
- **THEN** `piCompatibility.recommended` MAY be set to `"0.78.0"` and the dashboard SHALL accept either fork at that version

#### Scenario: Recommended version drives the upgrade hint

- **WHEN** the running pi-coding-agent version is below `piCompatibility.recommended`
- **THEN** `bootstrapState.compatibility.upgradeRecommended` is `true`
- **AND** the bootstrap status response is still `status: "ready"` (non-blocking)

#### Scenario: Minimum version drives the blocking error

- **WHEN** the running pi-coding-agent version is below `piCompatibility.minimum`
- **THEN** `bootstrapState.compatibility` includes a 503-blocking `error` message
- **AND** the bootstrap banner renders in the red "below minimum" state

#### Scenario: Pi 0.75 / 0.76 / 0.77 user sees blocking error after bump

- **WHEN** `piCompatibility.minimum` is `"0.78.0"`
- **AND** the running pi-coding-agent reports a version in the `0.75.x` / `0.76.x` / `0.77.x` range
- **THEN** the bootstrap status SHALL render the red "below minimum" banner with a clear upgrade hint pointing at `0.78.0`

#### Scenario: Maximum is unbounded

- **WHEN** `piCompatibility.maximum` is `null`
- **THEN** no upper-bound block is produced regardless of the running pi version

### Requirement: Node engines floor tracks pi minimum supported Node

The dashboard's declared Node engines floor SHALL be ≥ the Node minimum that `piCompatibility.minimum` requires. Pi 0.75.0 raised its Node floor from `22.18.0` to `22.19.0`; the dashboard SHALL mirror this transitively so users do not encounter pi-side Node errors after the dashboard reports "ready".

The floor applies to two manifests:

- Root `package.json::engines.node` (informational; surfaced by `npm install` warnings).
- `packages/server/package.json::engines.node` (enforced for users installing the server package directly via npm).

The runtime-side `packages/server/src/node-guard.ts::isAffectedNode` SHALL refuse to start on any Node version below the declared floor, with a clear stderr message naming the required version.

#### Scenario: Root engines.node matches pi floor
- **WHEN** `piCompatibility.minimum` is `"0.75.0"`
- **THEN** root `package.json::engines.node` SHALL be `">=22.19.0 <25"` (lower bound matches pi 0.75.0's minimum Node; upper bound preserved at current ceiling)

#### Scenario: Server engines.node matches pi floor
- **WHEN** `piCompatibility.minimum` is `"0.75.0"`
- **THEN** `packages/server/package.json::engines.node` SHALL be `">=22.19.0"` (no upper bound; the server consumes its host's Node)

#### Scenario: node-guard refuses below floor
- **WHEN** the server starts on Node `v22.18.0`
- **AND** `piCompatibility.minimum` is `"0.75.0"`
- **THEN** `assertNodeVersionSupported()` SHALL print the upgrade message and exit with code 1
- **AND** the upgrade message SHALL name `>=22.19.0` as the required version

#### Scenario: node-guard accepts at floor
- **WHEN** the server starts on Node `v22.19.0` exactly
- **THEN** `assertNodeVersionSupported()` SHALL return without exiting
- **AND** the server proceeds to its normal startup path

### Requirement: Bundled Node version meets pi minimum Node

The Electron-bundled Node version (`packages/electron/scripts/_node-version.sh::BUNDLED_NODE_VERSION`) SHALL meet or exceed the Node minimum that `piCompatibility.minimum` requires. This invariant SHALL be enforced by a repo-lint test so that a future bundled-Node downgrade cannot silently cross under the pi floor.

#### Scenario: Bundled Node satisfies floor
- **WHEN** `BUNDLED_NODE_VERSION` is `"v24.15.0"`
- **AND** `piCompatibility.minimum` is `"0.75.0"` (requires Node `22.19.0`)
- **THEN** the lint test SHALL pass because `24.15.0 > 22.19.0`

#### Scenario: Lint fires on bundled-Node regression
- **WHEN** a hypothetical change lowers `BUNDLED_NODE_VERSION` to `"v22.18.0"`
- **AND** `piCompatibility.minimum` still requires Node `22.19.0`
- **THEN** the lint test SHALL fail with a message naming both versions and pointing to `_node-version.sh` as the file to edit

### Requirement: pi.dev version check
The server SHALL query `https://pi.dev/api/latest-version` for `@mariozechner/pi-coding-agent` (and any successor `packageName` returned by previous pi.dev responses) instead of querying the npm registry directly. The npm registry SHALL be used as a fallback when pi.dev is unreachable, returns an error, or is skipped via environment variables.

#### Scenario: pi.dev queried for pi-coding-agent
- **WHEN** `PiCoreChecker.getStatus()` runs and a managed/global install of `@mariozechner/pi-coding-agent` is discovered
- **THEN** the server SHALL issue `GET https://pi.dev/api/latest-version` with header `User-Agent: pi/<currentVersion> (<platform>; <runtime>; <arch>)` matching pi's own self-update User-Agent
- **AND** parse the JSON response into `{ version: string, packageName?: string }`
- **AND** populate `PiCorePackage.latestVersion` from `response.version`

#### Scenario: pi.dev unreachable falls back to npm registry
- **WHEN** the pi.dev request fails (network error, non-2xx status, malformed JSON)
- **THEN** the server SHALL fall back to `fetchPackageMeta` against the npm registry for the same package name
- **AND** the fallback path SHALL produce a `PiCorePackage` with the same shape as the pi.dev path

#### Scenario: PI_OFFLINE skips pi.dev
- **WHEN** the `PI_OFFLINE` environment variable is set (any non-empty value)
- **THEN** the server SHALL NOT issue the pi.dev request
- **AND** SHALL fall back to the npm registry path immediately

#### Scenario: PI_SKIP_VERSION_CHECK skips pi.dev
- **WHEN** the `PI_SKIP_VERSION_CHECK` environment variable is set (any non-empty value)
- **THEN** the server SHALL NOT issue the pi.dev request
- **AND** SHALL fall back to the npm registry path immediately

#### Scenario: pi.dev returns dynamic packageName
- **WHEN** the pi.dev response includes a non-empty `packageName` field
- **THEN** the server SHALL treat that name as a trusted alias for `@mariozechner/pi-coding-agent`
- **AND** subsequent calls to `discoverGlobal()` and `discoverManaged()` SHALL include packages installed under that name in the result list, even if the name is not in the static `CORE_PACKAGE_NAMES` whitelist

#### Scenario: pi.dev not queried for non-pi packages
- **WHEN** `PiCoreChecker` checks any package other than `@mariozechner/pi-coding-agent` and its declared successors
- **THEN** the server SHALL use the npm registry path directly
- **AND** SHALL NOT issue any request to pi.dev

#### Scenario: 10-second timeout
- **WHEN** the pi.dev request takes longer than 10 seconds
- **THEN** the request SHALL be aborted via `AbortSignal.timeout(10000)`
- **AND** the server SHALL fall back to the npm registry path

#### Scenario: User-Agent reflects current pi version
- **WHEN** the pi.dev request is issued
- **THEN** the User-Agent header SHALL be `pi/<currentVersion> (<process.platform>; <runtime>; <process.arch>)` where `<runtime>` is `node/<process.version>` (or `bun/<bunVersion>` if running under Bun)
- **AND** the User-Agent SHALL NOT identify the dashboard separately

#### Scenario: No request when pi not yet installed
- **WHEN** no managed or global install of `@mariozechner/pi-coding-agent` is discovered
- **THEN** the server SHALL skip the pi.dev request entirely (since there is no `currentVersion` to send in the User-Agent)

#### Scenario: Cache TTL applies
- **WHEN** `PiCoreChecker.getStatus()` is called twice within 5 minutes
- **THEN** the second call SHALL return the cached result without re-issuing either pi.dev or npm registry requests

#### Scenario: Cache invalidation re-fetches via pi.dev
- **WHEN** `PiCoreChecker.invalidate()` is called (typically after a successful core update)
- **THEN** the next `getStatus()` SHALL re-issue the pi.dev request (cache cleared)

