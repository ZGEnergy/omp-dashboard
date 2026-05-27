## ADDED Requirements

### Requirement: Bundled-Node strategy resolves Electron-bundled runtime

The registry SHALL ship with a `bundledNodeStrategy(toolName: "node" | "npm" | "npx")` strategy that probes the Electron-bundled Node.js runtime under `process.resourcesPath/node/`. The strategy SHALL be wired into the strategy chains for `node`, `npm`, and `npx` immediately after `override` and BEFORE `managedRuntime`.

#### Scenario: bundled Node resolves on macOS packaged install

- **WHEN** the dashboard runs from a packaged macOS Electron app
- **AND** `process.resourcesPath/node/bin/node` exists
- **AND** no override for `"node"` is set
- **THEN** `registry.resolve("node")` SHALL return `{ ok: true, path: <resourcesPath>/node/bin/node, source: "bundled" }`

#### Scenario: bundled Node resolves on Windows packaged install

- **WHEN** the dashboard runs from a packaged Windows Electron app
- **AND** `process.resourcesPath\node\node.exe` exists
- **AND** no override for `"node"` is set
- **THEN** `registry.resolve("node")` SHALL return `{ ok: true, path: <resourcesPath>\node\node.exe, source: "bundled" }`

#### Scenario: bundled npm resolves with platform-correct extension

- **WHEN** the dashboard runs from a packaged Electron app
- **AND** the bundled `npm` exists at `<resourcesPath>/node/bin/npm` (Unix) or `<resourcesPath>\node\npm.cmd` (Windows)
- **THEN** `registry.resolveExecutor("npm")` SHALL include the bundled path in its `argv`
- **AND** `Resolution.source` SHALL equal `"bundled"`

#### Scenario: bundled npx resolves with platform-correct extension

- **WHEN** the dashboard runs from a packaged Electron app
- **AND** the bundled `npx` exists at `<resourcesPath>/node/bin/npx` (Unix) or `<resourcesPath>\node\npx.cmd` (Windows)
- **THEN** `registry.resolve("npx")` SHALL return `{ ok: true, source: "bundled", path: <bundled-npx-path> }`

#### Scenario: bundled strategy fast-fails when not under Electron

- **WHEN** `process.resourcesPath` is undefined or absent from `ctx.env`
- **THEN** the bundled-node strategy SHALL return `{ ok: false, reason: "no resourcesPath" }` without performing any filesystem probe
- **AND** the next strategy in the chain SHALL run

#### Scenario: bundled strategy falls through when bundled dir missing

- **WHEN** `process.resourcesPath` is set but `<resourcesPath>/node/` does not exist on disk
- **THEN** the bundled-node strategy SHALL return `{ ok: false, reason: "missing: <candidate-path>" }`
- **AND** the next strategy in the chain SHALL run
- **AND** the final `Resolution.tried` array SHALL include an entry naming the bundled strategy with its reason

#### Scenario: override wins over bundled

- **WHEN** an override is set for `"node"` pointing at an existing file at `/usr/local/bin/node`
- **AND** a bundled Node also exists at `<resourcesPath>/node/bin/node`
- **THEN** `registry.resolve("node")` SHALL return `{ ok: true, path: "/usr/local/bin/node", source: "override" }`
- **AND** the bundled-node strategy SHALL NOT run

### Requirement: `StrategyCtx.env.resourcesPath` is the injectable input

`StrategyCtx.env` SHALL include an optional `resourcesPath?: string` field. The `ToolRegistry` constructor SHALL populate it from `process.resourcesPath` by default; callers (and tests) SHALL be able to override it.

#### Scenario: production registry reads process.resourcesPath

- **WHEN** `new ToolRegistry()` is constructed without an `env` argument
- **THEN** `ctx.env.resourcesPath` SHALL equal `process.resourcesPath` (which may be `undefined` outside Electron)

#### Scenario: test registry accepts a fake resourcesPath

- **WHEN** `new ToolRegistry({ env: { resourcesPath: "/fake/Resources" } })` is constructed
- **THEN** every strategy SHALL receive `ctx.env.resourcesPath === "/fake/Resources"` regardless of the host's real `process.resourcesPath`

## MODIFIED Requirements

### Requirement: Source classification

Each `Resolution.source` SHALL be one of: `"override"`, `"managed"`, `"system"`, `"npm-global"`, `"bare-import"`, `"bundled"`, or `null`. The value SHALL be determined by the strategy that succeeded, not by re-analyzing the resolved path.

#### Scenario: Managed install classifies as managed

- **WHEN** the `managed` strategy succeeds for any tool
- **THEN** `Resolution.source` SHALL equal `"managed"`

#### Scenario: PATH resolution classifies as system

- **WHEN** the `where` strategy (backed by `ToolResolver.which`) succeeds and the resolved path does not start with `MANAGED_BIN`
- **THEN** `Resolution.source` SHALL equal `"system"`

#### Scenario: Bundled Node classifies as bundled

- **WHEN** the bundled-node strategy succeeds for `node`, `npm`, or `npx`
- **THEN** `Resolution.source` SHALL equal `"bundled"`
- **AND** the Settings → Tools UI SHALL render this as a distinct source badge

### Requirement: Registered tool set

The registry SHALL ship with definitions for at minimum: `pi` (binary), `pi-coding-agent` (module), `openspec` (binary), `npm` (binary), `npx` (binary), `node` (binary), `tsx` (binary), `git` (binary), `zrok` (binary), `gh` (binary), AND `bash` (binary). Each definition SHALL declare an ordered strategy chain and a `classify` function mapping resolved paths to `source` values.

#### Scenario: node strategy chain

- **WHEN** `registry.resolve("node")` runs
- **THEN** strategies SHALL be tried in order: `override`, `bundled-node` (`<resourcesPath>/node/bin/node` Unix / `\node\node.exe` Windows), `managedRuntime` (`<managedDir>/node/bin/node` Unix / `\node\node.exe` Windows), `managedBin` (`<managedDir>/node_modules/.bin/node`), `where` (delegating to `ToolResolver.which("node")`)

#### Scenario: npm strategy chain

- **WHEN** `registry.resolveExecutor("npm")` runs
- **THEN** strategies SHALL be tried in order: `override`, `bundled-node` (`<resourcesPath>/node/bin/npm` Unix / `\node\npm.cmd` Windows), `managedRuntime`, `managedBin`, `where`

#### Scenario: npx strategy chain

- **WHEN** `registry.resolve("npx")` runs
- **THEN** strategies SHALL be tried in order: `override`, `bundled-node` (`<resourcesPath>/node/bin/npx` Unix / `\node\npx.cmd` Windows), `managed` (`MANAGED_BIN/npx`), `where` (delegating to `ToolResolver.which("npx")`)
