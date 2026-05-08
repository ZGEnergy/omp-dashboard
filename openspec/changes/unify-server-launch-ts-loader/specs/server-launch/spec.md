# server-launch (ADDED)

## ADDED Requirements

### Requirement: Single shared dashboard-server spawn primitive

All dashboard-server spawns SHALL go through `launchDashboardServer(opts)` exported from `packages/shared/src/server-launcher.ts`. No call site outside this module MAY construct `node --import <loader> <cli>` argv directly. Internally, `launchDashboardServer` SHALL delegate argv construction to the existing `spawnNodeScript` helper in `packages/shared/src/platform/node-spawn.ts`.

#### Scenario: Extension auto-spawn

- **WHEN** the bridge extension detects no running server and decides to auto-spawn
- **THEN** it calls `launchDashboardServer({ cliPath, stdio: "ignore", healthTimeoutMs: 2000, ... })`
- **AND** does not import `resolveJitiImport` or call `child_process.spawn` for the server directly

#### Scenario: CLI `pi-dashboard start`

- **WHEN** `cmdStart` runs in `packages/server/src/cli.ts`
- **THEN** it calls `launchDashboardServer({ cliPath, stdio: { logFile }, healthTimeoutMs: 5000 })`

#### Scenario: Electron `spawnFromSource`

- **WHEN** Electron resolves a `LaunchSource` and spawns the server
- **THEN** it calls `launchDashboardServer({ cliPath: source.cliPath, anchor: source.cliPath, env: ToolResolver.buildSpawnEnv(), stdio: { logFile }, healthTimeoutMs: 15000 })`
- **AND** stamps `DASHBOARD_STARTER=Electron` via `env`

#### Scenario: Lint allow-list pinned to two files

- **WHEN** the repo-lint test `no-raw-node-import` runs
- **THEN** the `ALLOWLIST` constant contains exactly `packages/shared/src/platform/node-spawn.ts` and `packages/shared/src/server-launcher.ts`
- **AND** no source file in `packages/{extension,server,electron}/src/` contains the `ban:raw-node-import-ok` marker

### Requirement: Unified jiti resolution via `ToolResolver`

`ToolResolver.resolveJiti({ anchor?, resolver? })` SHALL be the single source of truth for resolving pi's `jiti-register.mjs`. Resolution order: managed pi install (`~/.pi-dashboard/node_modules/<pi-pkg>` for each entry of `["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"]`, primary then legacy) → system pi via `which("pi")` → caller-supplied `opts.anchor` walked up to nearest `node_modules` → `process.argv[1]` walked up. For every anchor, the inner walk SHALL try `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]` (upstream first, legacy fallback). Returns the register hook as a `file://` URL string (preserving the Windows drive-letter URL-wrapping contract documented on the prior `buildJitiRegisterUrl` helper) or null. The optional `resolver` parameter SHALL be the same `JitiResolver` test-injection seam currently exposed by `pickJitiRegisterUrl` / `pickJitiFromAnchor`, carried over so existing tests port without rewrite.

#### Scenario: Managed pi present (upstream)

- **WHEN** `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent` exists and resolves `jiti/package.json`
- **THEN** `resolveJiti()` returns a `file://` URL pointing at the upstream `jiti/lib/jiti-register.mjs`

#### Scenario: Managed pi present (legacy fork)

- **WHEN** managed pi is the legacy `@mariozechner/pi-coding-agent` shipping `@mariozechner/jiti`
- **THEN** `resolveJiti()` falls through to the legacy package and returns its register URL

#### Scenario: System pi only

- **WHEN** managed pi is absent but `which("pi")` resolves and pi's tree contains jiti
- **THEN** `resolveJiti()` returns the system pi's `jiti-register.mjs` as a `file://` URL

#### Scenario: Anchor walk-up (Electron packaged)

- **WHEN** `process.argv[1]` is empty or a flag (packaged Electron) and `opts.anchor` is a valid `cliPath` inside a `node_modules` tree containing jiti
- **THEN** `resolveJiti({ anchor: cliPath })` returns the jiti URL resolved from that tree

#### Scenario: Windows drive-letter wrapping

- **WHEN** the resolved jiti path begins with `B:\` or any other URL-scheme-colliding drive letter
- **THEN** `resolveJiti()` returns `file:///B:/.../jiti-register.mjs` (drive letter URL-wrapped, backslashes normalised to forward slashes)

#### Scenario: All sources missing

- **WHEN** none of managed, system, anchor, or argv yield a jiti path
- **THEN** `resolveJiti()` returns null
- **AND** `launchDashboardServer` raises `JitiNotFoundError` when its caller did not supply a usable anchor

### Requirement: Removed predecessors

The following symbols SHALL be removed once all call sites are migrated:

- `packages/shared/src/resolve-jiti.ts` (file deleted; `resolveJitiImport`, `resolveJitiFromAnchor`, `buildJitiRegisterUrl`, `pickJitiRegisterUrl`, `pickJitiFromAnchor`, and the `JitiResolver` type all subsumed into `ToolResolver.resolveJiti` — the resolver-injection seam is preserved verbatim).
- `packages/electron/src/lib/ts-loader-resolver.ts` (file deleted).
- `resolveJitiFromPi` export in `packages/electron/src/lib/server-lifecycle.ts`.
- `deps.resolveJitiFromAnchor` injection seam in `packages/electron/src/lib/launch-source.ts`.

#### Scenario: Symbol-presence check

- **WHEN** the migration is complete
- **THEN** `git grep -nE 'resolveJitiImport|resolveJitiFromAnchor|resolveJitiFromPi|ts-loader-resolver|buildJitiRegisterUrl|pickJitiRegisterUrl|pickJitiFromAnchor'` returns zero matches under `packages/` (excluding `out/`, `dist/`, `node_modules/`)
