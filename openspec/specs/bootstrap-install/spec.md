# bootstrap-install

## Purpose

Requirements governing how the PI Dashboard bootstraps its runtime dependencies (`pi-coding-agent`, `openspec`, `tsx`, and the dashboard server) on first launch across delivery channels (npm CLI, Electron installers per platform). Covers both online and offline first-run flows, integrity verification, and diagnostic surfacing.

## Requirements

### Requirement: Electron artifacts ship a per-platform offline npm cache

Every published Electron artifact (DMG, DEB, AppImage, NSIS, ZIP / portable) SHALL include a `resources/offline-packages/` directory containing a `manifest.json` and a `npm-cache.tar.gz` gzip of a pre-populated npm `_cacache/` tree targeted at that artifact's platform. The cache SHALL contain every tarball required to install `@mariozechner/pi-coding-agent`, `@fission-ai/openspec`, and `tsx` at their pinned versions without any network access.

#### Scenario: Manifest and cache present in packaged ZIP

- **WHEN** a user unzips the Windows portable ZIP
- **THEN** `<app>/resources/offline-packages/manifest.json` exists
- **AND** `<app>/resources/offline-packages/npm-cache.tar.gz` exists
- **AND** `manifest.json.targetPlatform` equals `"win32-x64"`

#### Scenario: Cache integrity declared

- **WHEN** the build script produces the cache tarball
- **THEN** `manifest.json.sha256` matches the SHA-256 of the tarball content

#### Scenario: Per-platform payloads

- **WHEN** the macOS arm64 DMG and the Windows x64 NSIS are both inspected
- **THEN** each contains a `manifest.json` whose `targetPlatform` matches the artifact's platform
- **AND** neither ships the other platform's cache

### Requirement: First-run installer uses bundled cache with --offline

When `resources/offline-packages/manifest.json` is present, the first-run installer SHALL extract `npm-cache.tar.gz` into the managed install directory and invoke `npm install --offline --cache <extracted>` to install the three pinned packages. The installer SHALL NOT contact the npm registry for these packages or their transitive dependencies on first run.

#### Scenario: Offline cache present, network available

- **WHEN** the Electron app runs its first-run installer on a machine with network access
- **AND** the offline manifest is present
- **THEN** the installer extracts `npm-cache.tar.gz` to `<managedDir>/.offline-cache/`
- **AND** verifies the tarball SHA-256 against `manifest.sha256` BEFORE extraction
- **AND** invokes `npm install --offline --cache <managedDir>/.offline-cache` with the three pinned `name@version` pairs
- **AND** issues zero network requests to the npm registry

#### Scenario: Offline cache present, air-gapped

- **WHEN** the Electron app runs on a machine with no internet access
- **AND** the offline manifest is present
- **THEN** installation succeeds with no registry contact

#### Scenario: Cache integrity mismatch

- **WHEN** the tarball SHA-256 does not match `manifest.sha256`
- **THEN** the installer aborts with an integrity error
- **AND** does NOT fall back to the registry
- **AND** does NOT extract the tarball

#### Scenario: Cache install failure does not fall back

- **WHEN** `npm install --offline` exits non-zero
- **THEN** the installer reports the failure through the progress callback with `status: "error"`
- **AND** does NOT retry with registry access on the same run
- **AND** preserves `<managedDir>/.offline-cache/` for debugging

#### Scenario: Cache cleanup on success

- **WHEN** `npm install --offline` exits zero
- **THEN** the installer deletes `<managedDir>/.offline-cache/` to reclaim disk space
- **AND** the source `resources/offline-packages/npm-cache.tar.gz` remains untouched

#### Scenario: Manifest absent

- **WHEN** the offline manifest is NOT present (dev build without the bundle step)
- **THEN** the installer falls back to today's registry-based per-package install loop unchanged

### Requirement: Doctor surfaces bundle state

The Electron Doctor diagnostic SHALL include a row showing whether the offline bundle is present and, if so, the target platform and versions of the three bundled packages.

#### Scenario: Bundle present

- **WHEN** the user opens Doctor in a build that shipped with the bundle
- **THEN** the "Offline packages bundle" row shows a check mark
- **AND** displays `manifest.targetPlatform`
- **AND** lists the three pinned packages with versions

#### Scenario: Bundle absent

- **WHEN** the user opens Doctor in a dev build without the bundle
- **THEN** the row shows "Not bundled (registry-install mode)"
- **AND** does NOT fail or block any other diagnostic


### Requirement: Single shared installer module
The system SHALL expose a single `bootstrapInstall` function in `packages/shared/src/bootstrap-install.ts` callable from all entry points (Electron wizard, `pi-dashboard` CLI first-run, `pi-dashboard upgrade-pi` CLI, `/api/bootstrap/upgrade-pi` REST).

#### Scenario: Electron wizard uses shared installer
- **WHEN** the Electron wizard runs "Setup everything"
- **THEN** it calls `bootstrapInstall` from the shared module, not a local Electron-only function

#### Scenario: CLI first-run uses shared installer
- **WHEN** `pi-dashboard` starts and pi resolution fails
- **THEN** the server calls `bootstrapInstall` with `packages: ["@mariozechner/pi-coding-agent", "openspec", "tsx"]` async, without blocking server startup

### Requirement: Degraded-mode startup
The dashboard server SHALL start in degraded mode when pi is not yet resolvable, remaining fully operational for non-pi-dependent operations while bootstrap install runs in the background.

#### Scenario: Server listens during install
- **WHEN** bootstrap install is running
- **THEN** `/api/health` returns `ok: true`
- **AND** `/api/bootstrap/status` returns `{ status: "installing", progress: {...} }`
- **AND** static client assets are served normally
- **AND** the WebSocket gateway accepts connections

#### Scenario: Session spawn queued during install
- **WHEN** bootstrap status is "installing"
- **AND** a client requests `POST /api/spawn-session`
- **THEN** the request returns 202 Accepted with `{ status: "queued", ticketId: "..." }`
- **AND** the request is processed once status transitions to "ready"

#### Scenario: Terminals spawn normally during install (current protocol)
- **WHEN** bootstrap status is "installing"
- **AND** a client requests a terminal (the `create_terminal` browser message carries only `cwd` — no shell command)
- **THEN** the terminal spawns with the OS default shell via `detectShell()` (`bash`, `zsh`, `cmd.exe`, or `powershell.exe` — never `pi`)
- **AND** the spawn succeeds regardless of bootstrap status (terminals are not pi-dependent under the current protocol)

#### Scenario: Future-proof — pi-shell terminal would be rejected
- **WHEN** the protocol is extended (future change) to allow custom shell commands on `create_terminal`
- **AND** bootstrap status is "installing"
- **AND** a client requests a terminal whose shell command resolves to `pi`
- **THEN** the request MUST return 503 with `{ error: "pi not yet installed" }`
- **AND** the gate infrastructure (`bootstrapState` + `bootstrapQueue` in `packages/server/src/`) is ready to wire when this protocol extension lands

### Requirement: Bootstrap status API
The server SHALL expose `GET /api/bootstrap/status` returning the current state and broadcast `bootstrap_status_update` over the browser WebSocket gateway on every transition.

#### Scenario: Initial state query
- **WHEN** a client calls `GET /api/bootstrap/status` at any time
- **THEN** the response matches `{ status: "ready" | "installing" | "failed", progress?, error?, version?, compatibility? }`

#### Scenario: Transition broadcasts
- **WHEN** bootstrap status changes from "installing" → "ready"
- **THEN** every connected browser receives a `bootstrap_status_update` message with the new state

#### Scenario: Status reflects version compatibility
- **WHEN** pi is resolved but its version is below `piCompatibility.recommended`
- **THEN** the status response includes `upgradeRecommended: true`
- **AND** the response is still `status: "ready"` (non-blocking hint)

### Requirement: Auto-register bridge after bootstrap
The bootstrap install flow SHALL invoke `registerBridgeExtension(findBundledExtension())` after successful package installation, so pi-side bridge registration happens without user action.

#### Scenario: Bridge registration on first successful install
- **WHEN** `bootstrapInstall` completes successfully
- **AND** `findBundledExtension()` returns a valid path
- **THEN** the extension is registered in `~/.pi/agent/settings.json`
- **AND** existing valid registrations are preserved (non-destructive cleanup per bridge-register.ts)

#### Scenario: Bridge registration failure non-fatal
- **WHEN** `registerBridgeExtension` throws (e.g., malformed settings.json)
- **THEN** bootstrap status STILL transitions to "ready"
- **AND** a warning is logged with actionable diagnostics
- **AND** a `bridgeRegistrationError` field appears in the status response

### Requirement: upgrade-pi CLI subcommand
The `pi-dashboard` CLI SHALL accept an `upgrade-pi` subcommand that upgrades pi-coding-agent via the same `bootstrapInstall` path.

#### Scenario: Upgrade when dashboard is running
- **WHEN** `pi-dashboard upgrade-pi` runs
- **AND** a dashboard is already running (detected via `isDashboardRunning()`)
- **THEN** the CLI POSTs to `/api/bootstrap/upgrade-pi`
- **AND** streams progress to stdout via WebSocket
- **AND** exits with code 0 on success, non-zero on failure

#### Scenario: Upgrade when no dashboard is running
- **WHEN** `pi-dashboard upgrade-pi` runs
- **AND** no dashboard responds on the configured port
- **THEN** the CLI calls `bootstrapInstall` directly
- **AND** streams progress to stdout
- **AND** exits when done — does not leave a dashboard server running

### Requirement: Upgrade triggers session reload
On successful pi upgrade, the dashboard SHALL broadcast a `reload_all` message to all connected bridges so open sessions pick up the new pi version.

#### Scenario: Open sessions refresh after upgrade
- **WHEN** bootstrap upgrade completes and pi version changes
- **THEN** all connected bridges receive `reload_all`
- **AND** each bridge reloads its pi process, preserving session meta state

### Requirement: Global pi takes precedence
Users with an existing global pi install SHALL see NO shadow install into `~/.pi-dashboard/` — bootstrap install SHALL run only when `ToolRegistry.resolve("pi")` fails across all strategies.

#### Scenario: Global pi present, bootstrap skipped
- **WHEN** `pi-dashboard` starts
- **AND** `ToolRegistry.resolve("pi")` returns `ok: true` with source `npm-global`
- **THEN** `bootstrapInstall` is NOT invoked
- **AND** `bootstrap.status` transitions directly to "ready"

### Requirement: Concurrent bootstrap serialization
If `single-dashboard-per-home` has landed, bootstrap install SHALL run inside the acquired per-HOME advisory lock to prevent two simultaneous dashboards racing on `npm install`.

#### Scenario: Second invocation attaches instead of installing
- **WHEN** two `pi-dashboard` processes launch within the same second with no prior install
- **AND** the first acquires the lock
- **THEN** the second detects the live instance via lock metadata + `isDashboardRunning()`
- **AND** attaches (opens browser), does NOT run its own `bootstrapInstall`

### Requirement: Electron wizard delegates to shared installer
The Electron first-run wizard SHALL NOT contain a parallel registry-install implementation. Its registry-install loop (resolve npm, `npm install <pkg>`, stream progress) SHALL be delegated to `bootstrapInstall` from `@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js`, either directly from the IPC handler OR via a thin Electron wrapper that adds only Electron-specific concerns (bundled Node + `npm-cli.js`, offline-cacache bundle, bundled-extension activation). The wizard's UX is unchanged — only the underlying call site is refactored.

#### Scenario: Existing wizard tests still pass
- **WHEN** the wizard's "Setup everything" IPC handler runs
- **THEN** the same progress events fire
- **AND** the same final state is reached
- **AND** no test needs updating beyond the import path

#### Scenario: No duplicate registry-install logic in Electron
- **WHEN** a new `npm install <pkg>` call needs to be added to the bootstrap flow
- **THEN** it SHALL be added to the shared `bootstrapInstall` function in `packages/shared/src/bootstrap-install.ts`
- **AND** any Electron-specific behavior (bundled Node, offline cacache, postinstall PATH) is added as injectable options on `BootstrapInstallOptions` (`npmArgv`, `env`, `registry`) — NOT as a parallel install loop in Electron
