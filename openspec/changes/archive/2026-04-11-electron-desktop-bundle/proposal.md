## Why

The pi-dashboard currently requires users to manually install Node.js, pi, and openspec before they can use it. This creates a high barrier to entry — especially for non-developers or users on fresh machines. An Electron desktop bundle packages everything into a single installable app that works out of the box on macOS, Linux, and Windows, while still coexisting with the existing web-based workflow.

## What Changes

- New Electron shell that acts as a **smart window + server bootstrapper** — not an in-process server. The dashboard server always runs as a separate detached process (same as `pi-dashboard start`), and Electron opens a BrowserWindow pointing at it.
- Bundle standalone Node.js v22 LTS as `extraResources` for bootstrapping pi/openspec installation
- First-run setup wizard with two modes: **standalone** (install everything into `~/.pi-dashboard/`) or **power user** (use existing system pi). Includes API key configuration.
- Uses existing `isDashboardRunning()` and mDNS discovery from `@blackbelt-technology/pi-dashboard-shared` for reliable server detection (already implemented in `mdns-server-discovery` change).
- `spawnStrategy` default already changed to `"headless"` (done in prior work). Electron mode forces headless regardless.
- CI build matrix producing platform installers: macOS `.dmg` (universal), Linux `.AppImage` (x64), Windows `.exe` NSIS (x64)
- Periodic pi/openspec update check with user prompt
- Single-instance lock via `app.requestSingleInstanceLock()` to prevent multiple Electron windows
- System tray integration — minimize to tray on close, quick reopen
- App auto-updater via `electron-updater` + GitHub Releases
- The existing web dashboard (`pi-dashboard` CLI) continues to work unchanged — Electron is an alternative entry point
- **No port collision**: only one server ever runs per machine. Electron detects an existing server via mDNS + health check and connects to it; if none is running, it launches one as a detached process. CLI-started and Electron-started servers are interchangeable.
- **Server outlives Electron**: closing the Electron window does not kill the server (bridges stay connected). Optionally stops the server on quit via tray "Quit" only if Electron was the one that started it.

## Capabilities

### New Capabilities
- `electron-shell`: Electron main/renderer process lifecycle, BrowserWindow management, single-instance lock, system tray (minimize on close, "Show"/"Quit" menu), optional server lifecycle (start on launch, stop on quit if we started it)
- `bundled-node-runtime`: Standalone Node.js v22 LTS packaging as extraResources, platform-specific binary selection, PATH management for spawned processes
- `dependency-installer`: Runtime detection and installation of pi, dashboard package, openspec, and tsx via bundled npm, managed install location (`~/.pi-dashboard/node_modules/`), TS loader resolution per mode
- `first-run-wizard`: Mode selection (standalone vs power user), dependency installation/verification with progress, API key configuration, mode persistence to `~/.pi-dashboard/mode.json`
- `electron-build-pipeline`: electron-forge configuration, CI matrix for macOS/Linux/Windows, code signing (macOS), auto-updater
- `dependency-auto-update`: Periodic outdated check for pi/openspec, user prompt for updates, background installation

### Modified Capabilities
- `process-manager`: Electron mode forces headless spawn strategy, skip tmux detection. Managed install bin prepended to spawned process PATH.
- `shared-config`: New `electronMode` flag to distinguish Electron vs CLI server startup.
- `terminal-emulator`: Windows shell detection — fall back to `powershell.exe` or `cmd.exe` when `$SHELL` / `/bin/bash` unavailable.
- `session-process-tracker`: Windows process scanning via `wmic`/`tasklist` and `taskkill` for process termination (currently disabled on Windows).
- `open-in-editor`: Windows editor detection patterns (VS Code, IntelliJ paths on Windows).

### Already Completed (prerequisites)
- **`mdns-server-discovery`** (archived): `isDashboardRunning()` in `packages/shared/src/server-identity.ts`, mDNS discovery in `packages/shared/src/mdns-discovery.ts`, `ServerSelector` component, bridge mDNS connection handling — all implemented and available.
- **`spawnStrategy` default**: Already changed to `"headless"` globally.
- **Monorepo restructure** (archived): Project split into `packages/client`, `packages/server`, `packages/extension`, `packages/shared`, `packages/dist`. CORS support added for cross-origin client serving.

## Impact

- **New workspace**: `packages/electron/` for Electron main process, preload, forge config (follows monorepo pattern)
- **Build tooling**: `electron-forge` added as dev dependency in the electron workspace
- **CI**: New GitHub Actions workflow for cross-platform Electron builds
- **Bundle size**: ~250MB per platform (Electron ~150MB + Node.js ~80MB + app ~15MB)
- **No breaking changes**: Existing `pi-dashboard` CLI, bridge extension, and web client are unaffected
