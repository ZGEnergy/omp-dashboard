## ADDED Requirements

### Requirement: Electron-bundled runtime strategy for npm and node

The `npm` and `node` executor definitions in `packages/shared/src/tool-registry/definitions.ts` SHALL include an `electron-bundled` strategy that probes the bundled Node.js runtime shipped inside an Electron application package. The strategy SHALL read `process.resourcesPath` (injectable via `StrategyDeps.resourcesPath` for tests) and SHALL resolve from these locations:

| Platform | Tool | Probed path |
| --- | --- | --- |
| unix    | `node` | `<resourcesPath>/node/bin/node` |
| win32   | `node` | `<resourcesPath>/node/node.exe` |
| unix    | `npm`  | `<resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js` |
| win32   | `npm`  | `<resourcesPath>/node/node_modules/npm/bin/npm-cli.js` |

The strategy SHALL appear in BOTH the unix and win32 strategy chains,
positioned AFTER `managed-runtime` and BEFORE `where`. On Windows, it
SHALL ALSO be positioned BEFORE the existing `npmCliBesideNode`
strategy slot.

The strategy SHALL classify resolutions as `Source.managed` and
SHALL record its `tried[]` entry name as `"electron-bundled"` for
diagnostic distinguishability from the persistent `managed-runtime`
strategy.

#### Scenario: Strategy resolves bundled npm on macOS Electron

- **WHEN** `process.resourcesPath` is set to `/Applications/PI-Dashboard.app/Contents/Resources`
- **AND** `<resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js` exists
- **AND** no override is registered for `npm`
- **AND** no managed runtime is installed at `~/.pi-dashboard/node/`
- **THEN** `registry.resolve("npm")` SHALL succeed with
  `path = <resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js`
- **AND** `Resolution.source` SHALL equal `"managed"`
- **AND** `Resolution.tried[]` SHALL contain an entry with
  `strategy = "electron-bundled"` and `result = "ok"`

#### Scenario: Strategy resolves bundled node on Windows Electron

- **WHEN** the platform is `win32`
- **AND** `process.resourcesPath` is set to `C:\\Program Files\\PI Dashboard\\resources`
- **AND** `<resourcesPath>/node/node.exe` exists
- **AND** no override is registered for `node`
- **AND** no managed runtime is installed
- **THEN** `registry.resolve("node")` SHALL succeed with
  `path = <resourcesPath>/node/node.exe`
- **AND** `Resolution.source` SHALL equal `"managed"`

#### Scenario: Strategy yields cleanly when not running in Electron

- **WHEN** `process.resourcesPath` is `undefined`
- **THEN** the `electron-bundled` strategy SHALL return
  `{ ok: false, reason: "not running in Electron (no resourcesPath)" }`
- **AND** chain iteration SHALL continue to the next strategy
- **AND** no filesystem probe SHALL be performed

#### Scenario: Strategy yields cleanly when bundled tree is absent

- **WHEN** `process.resourcesPath` is set
- **AND** `<resourcesPath>/node/` does not exist
- **THEN** the `electron-bundled` strategy SHALL return
  `{ ok: false, reason: "missing: <probed path>" }`
- **AND** chain iteration SHALL continue to the next strategy

#### Scenario: Managed runtime wins over Electron-bundled when both exist

- **WHEN** `~/.pi-dashboard/node/bin/npm` exists (managed runtime installed)
- **AND** `process.resourcesPath` is also set with a populated bundled tree
- **AND** no override is registered for `npm`
- **THEN** `registry.resolve("npm")` SHALL succeed via the
  `managed-runtime` strategy (NOT `electron-bundled`)
- **AND** `Resolution.tried[]` SHALL show `electron-bundled` with no
  entry (chain terminated at `managed-runtime`)

#### Scenario: Override wins over Electron-bundled

- **WHEN** the user has registered an override for `npm` at
  `/opt/homebrew/bin/npm`
- **AND** the override path exists
- **AND** `process.resourcesPath` is also set with a populated bundled tree
- **THEN** `registry.resolve("npm")` SHALL succeed via the `override`
  strategy
- **AND** `Resolution.source` SHALL equal `"override"`

### Requirement: Node-script executor argv pairs interpreter with .js paths on all platforms

The shared `nodeScriptToArgv` helper used by node-script executors (`pi`, `openspec`, `npm`) SHALL prepend the registry-resolved node interpreter to the resolved path WHENEVER the resolved path ends in `.js` — on every platform, not only Windows. For resolved paths that
do NOT end in `.js` (shell wrappers, native binaries, symlinks named
without an extension) argv SHALL remain `[<resolvedPath>]`.

This change makes Electron-bundled npm spawnable: the strategy resolves
to `npm-cli.js`, and the executor wraps as `[<bundled-node>, <npm-cli.js>]`
so the spawn no longer depends on `node` being PATH-resolvable in the
Electron GUI process.

#### Scenario: Unix npm-cli.js resolution pairs with bundled node

- **WHEN** `registry.resolve("npm")` succeeds with
  `path = <resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js`
- **AND** `registry.resolve("node")` succeeds with
  `path = <resourcesPath>/node/bin/node`
- **THEN** `registry.resolveExecutor("npm").argv` SHALL equal
  `[<bundled-node>, <bundled-npm-cli.js>]`
- **AND** `argv.length` SHALL equal 2

#### Scenario: Unix shell-wrapper resolution remains single-element

- **WHEN** `registry.resolve("npm")` succeeds via the `where` strategy
  with `path = /usr/local/bin/npm` (a shell wrapper, not ending in `.js`)
- **THEN** `registry.resolveExecutor("npm").argv` SHALL equal
  `["/usr/local/bin/npm"]`
- **AND** `argv.length` SHALL equal 1

### Requirement: Pi `DefaultPackageManager` constructs without ENOENT on first Electron boot

The dashboard server SHALL be able to instantiate pi's
`DefaultPackageManager` (via `packages/server/src/package-manager-wrapper.ts`)
on a clean Electron first-launch — before
`installManagedNode()` has populated `~/.pi-dashboard/node/` and on a
system with no `npm` on the GUI process's PATH — without throwing
`Failed to run npm root -g: spawnSync npm ENOENT`.

#### Scenario: Clean Electron boot resolves npm via bundled runtime

- **WHEN** PI-Dashboard.app launches on macOS for the first time
- **AND** `~/.pi-dashboard/` does not yet contain a `node/` subdirectory
- **AND** `process.env.PATH` does NOT include any directory containing `npm`
- **THEN** when `loadPiPackageManager()` constructs `SafePackageManager`
- **AND** pi's package manager invokes `runCommandSync("npm", ["root", "-g"])`
- **THEN** `resolveViaRegistry()` SHALL return a resolved argv of the
  form `[<bundled-node>, <bundled-npm-cli.js>, "root", "-g"]`
- **AND** the spawn SHALL succeed (no ENOENT)
- **AND** the wrapper SHALL NOT throw `Failed to run npm root -g`
