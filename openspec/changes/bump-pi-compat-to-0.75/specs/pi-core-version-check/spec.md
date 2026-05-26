## MODIFIED Requirements

### Requirement: piCompatibility block tracks current upstream pi-coding-agent

The `packages/server/package.json` `piCompatibility` block SHALL declare a `recommended` version that is no more than one minor release behind the latest published `@earendil-works/pi-coding-agent` and a `minimum` version that matches the version actually exercised in the dashboard's tests and bundled offline cache.

When the bundled offline cache still pins the legacy `@mariozechner/pi-coding-agent` build (transitional state), the `minimum` SHALL match that legacy version; the `recommended` SHALL still track the earendil release stream so the upgrade-hint UI surfaces forward-progress.

#### Scenario: Recommended tracks earendil 0.75 line

- **WHEN** the latest published `@earendil-works/pi-coding-agent` is `0.75.5`
- **AND** the bundled offline cache also pins `@earendil-works/pi-coding-agent@0.75.0` or newer
- **THEN** `piCompatibility.minimum` SHALL be `"0.75.0"`
- **AND** `piCompatibility.recommended` SHALL be `"0.75.5"`

#### Scenario: Recommended tracks earendil even when offline cache is legacy
- **WHEN** the bundled offline cache pins `@mariozechner/pi-coding-agent@0.70.0`
- **AND** the latest published `@earendil-works/pi-coding-agent` is `0.75.5`
- **THEN** `piCompatibility.minimum` SHALL be `"0.70.0"` (matching the offline cache)
- **AND** `piCompatibility.recommended` SHALL be no more than one minor behind `0.75.5` (e.g., `"0.74.0"` or `"0.75.5"`)

#### Scenario: Recommended tracks earendil when both forks publish in lockstep
- **WHEN** both `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` publish `0.75.5`
- **THEN** `piCompatibility.recommended` MAY be set to `"0.75.5"` and the dashboard SHALL accept either fork at that version

#### Scenario: Recommended version drives the upgrade hint
- **WHEN** the running pi-coding-agent version is below `piCompatibility.recommended`
- **THEN** `bootstrapState.compatibility.upgradeRecommended` is `true`
- **AND** the bootstrap status response is still `status: "ready"` (non-blocking)

#### Scenario: Minimum version drives the blocking error
- **WHEN** the running pi-coding-agent version is below `piCompatibility.minimum`
- **THEN** `bootstrapState.compatibility` includes a 503-blocking `error` message
- **AND** the bootstrap banner renders in the red "below minimum" state

#### Scenario: Pi 0.74 user sees blocking error after bump
- **WHEN** `piCompatibility.minimum` is `"0.75.0"`
- **AND** the running pi-coding-agent reports version `"0.74.1"`
- **THEN** the bootstrap status SHALL render the red "below minimum" banner with a clear upgrade hint pointing at `0.75.5`

#### Scenario: Maximum is unbounded
- **WHEN** `piCompatibility.maximum` is `null`
- **THEN** no upper-bound block is produced regardless of the running pi version

## ADDED Requirements

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
