## ADDED Requirements

### Requirement: In-memory bootstrap harness
The project SHALL provide an in-memory test harness for bootstrap resolution (ToolRegistry + bridge registration) that requires no process spawning, no real filesystem access, and runs in milliseconds per scenario.

#### Scenario: Pure-in-memory execution
- **WHEN** a harness-based test runs
- **THEN** no `fs.existsSync`, `child_process.spawn`, or network access occurs against the real environment
- **AND** the test completes in under 50ms

#### Scenario: Declarative fixture composition
- **WHEN** a scenario declares `fs: layer(fixtureA, fixtureB, fixtureC)`
- **THEN** the resulting in-memory filesystem contains the union of all three layers with later layers overriding earlier entries on path conflict

### Requirement: Trail snapshot as primary assertion
The harness SHALL provide a `snapshotTrail(resolution)` helper whose output normalizes environment-specific paths (`<HOME>`, `<NPM_ROOT>`) and separators so snapshots are stable across Windows/macOS/Linux CI.

#### Scenario: Stable across operating systems
- **WHEN** the same scenario fixture runs on Windows, macOS, and Linux CI
- **THEN** `snapshotTrail()` produces identical output on all three

#### Scenario: Captures strategy chain
- **WHEN** pi resolution falls through override → managed → npm-global
- **THEN** the snapshot contains all three strategy entries with their reason strings, in order

#### Scenario: Captures `toArgv` composition
- **WHEN** resolved binary is a `.js` file on Windows
- **THEN** the snapshot's `toArgv` field shows `[<NODE>, <resolved-path>]`, proving the no-cmd-flash invariant

### Requirement: settings.json mutation snapshots
The harness SHALL provide `snapshotSettingsDelta(before, after)` that renders the changes `registerBridgeExtension` made as added/removed/preserved lines.

#### Scenario: Non-destructive cleanup preserves other packages
- **WHEN** settings.json contains an unrelated extension path
- **AND** bridge registration runs
- **THEN** the delta snapshot shows the bridge entry as "added" and the unrelated entry as "preserved"

#### Scenario: Stale path removed
- **WHEN** settings.json contains a dashboard-related path pointing to a non-existent directory
- **THEN** the delta snapshot shows the stale entry as "removed"

#### Scenario: AppImage temp mount rejected
- **WHEN** the bundled extension path resolves under `/tmp/.mount_*`
- **THEN** the delta shows no change to settings.json and the warnings section records "AppImage detected — skipping"

### Requirement: Fail-closed scenario cube
The harness SHALL enumerate the combinatorial space `platform × dashboard-location × pi-state × settings-state × env-drift` and fail CI when a cell has neither a registered test nor an explicit skip marker.

#### Scenario: New install mechanic forces categorization
- **WHEN** a new platform, dashboard location, or pi-state value is added to the enumeration
- **AND** the cube expansion produces cells that are not present in `REGISTERED_SCENARIOS` or `SKIPPED_SCENARIOS`
- **THEN** `cube.test.ts` fails with an error listing the unclassified cells

#### Scenario: Skip requires a reason
- **WHEN** a cell is added to `SKIPPED_SCENARIOS`
- **THEN** the entry contains a non-empty reason string (e.g., "appimage × npm-g not a real combination", "lock-file scenarios live in single-dashboard-per-home")

### Requirement: Scenario family coverage
The harness SHALL register tests for all ~25 curated cells in `design.md §6` (families A–K) at introduction time. Subsequent changes MAY add cells; they MUST NOT remove cells without documenting the removal.

#### Scenario: Core install mechanics covered
- **WHEN** the harness runs
- **THEN** at least one test exists for each of: electron-packaged, npm-global-full, npm-global-dash-only, dev-monorepo, override (valid + invalid), stale-managed, cwd-spaces, cwd-unicode, Windows-cmd-shim, HOME-drift

#### Scenario: Windows-specific coverage
- **WHEN** tests run on any OS
- **THEN** Windows-specific scenarios (G1–G4, H1, C2) execute via the fake `platform: "win32"` context without requiring a real Windows runner

## MODIFIED Requirements

### Requirement: ToolRegistry accepts injectable environment
The `ToolRegistry` SHALL accept an optional `PlatformEnv` context (`{ platform, homedir, cwd, env, overrides }`) at construction. When omitted, the live process environment is used — preserving all existing production behavior.

#### Scenario: Live defaults unchanged
- **WHEN** `getDefaultRegistry()` is called in production
- **THEN** resolution behavior is identical to pre-change behavior
- **AND** no production call site requires modification

#### Scenario: Test-injected environment
- **WHEN** a test constructs `new ToolRegistry({ env: fakeEnv })`
- **THEN** all strategies see the fake `homedir`, `platform`, and `env`, with no fallback to the real process state

### Requirement: Managed paths exposed as getters
The `packages/shared/src/managed-paths.ts` module SHALL export `getManagedDir(env?)` and `getManagedBin(env?)` functions alongside the existing `MANAGED_DIR` and `MANAGED_BIN` constants. Constants continue to reflect the live environment; getters accept an optional `{ homedir }` override.

#### Scenario: Constant remains live
- **WHEN** production code imports `MANAGED_DIR`
- **THEN** the value equals `path.join(os.homedir(), ".pi-dashboard")` at module load time

#### Scenario: Getter accepts override
- **WHEN** a test calls `getManagedDir({ homedir: "/fake/home" })`
- **THEN** the returned path is `/fake/home/.pi-dashboard`

### Requirement: bareImportStrategy accepts injectable module resolver
The `bareImportStrategy` function SHALL accept a `resolveModule(id, from)` function via `StrategyDeps`. The default implementation uses `createRequire(from).resolve(id)`; tests inject a fake resolver walking a fake filesystem.

#### Scenario: Default resolver uses createRequire
- **WHEN** `bareImportStrategy("@mariozechner/pi")` runs with no deps override
- **THEN** it calls `createRequire(anchor).resolve("@mariozechner/pi")`

#### Scenario: Fake resolver returns fixture paths
- **WHEN** the harness injects `resolveModule: (id, from) => fakePaths[`${from}/${id}`]`
- **THEN** `bareImportStrategy` returns the fake path without touching real fs
