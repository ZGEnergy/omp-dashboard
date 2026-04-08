## Context

The pi-dashboard is a three-component system: bridge extension (runs inside pi sessions), Node.js server (HTTP + dual WebSocket), and React web client. Currently it's distributed as an npm package requiring manual installation of Node.js, pi, and openspec. The server is started via CLI (`pi-dashboard start`) or auto-launched by the bridge extension. Server discovery uses a hardcoded port from `~/.pi/dashboard/config.json` with bare TCP probes.

The goal is to package this as a standalone Electron desktop app that works on a fresh machine, while preserving the existing CLI/browser workflow. Server detection needs a health-check upgrade to avoid false positives with other services on the same port.

## Goals / Non-Goals

**Goals:**
- Single-click install desktop app for macOS, Linux, Windows
- Zero prerequisites on a fresh machine — bundled Node.js bootstraps pi/openspec installation
- Two installation modes: standalone (everything managed) and power user (existing pi)
- Reliable server detection via health-check identity verification
- Coexistence with the existing CLI + browser workflow
- CI pipeline producing signed installers for all platforms

**Non-Goals:**
- Embedding the pi CLI inside the Electron bundle (pi is installed at runtime via npm)
- Running the dashboard server in-process within Electron (server is always a detached process)
- Replacing the web-based dashboard (Electron is an additional entry point)
- Mobile Electron builds (web/PWA already covers mobile)
- mDNS/LAN discovery and server selector (separate change — can be layered on later)

## Decisions

### D1: Electron as smart window, not in-process server

**Decision:** Electron opens a BrowserWindow pointing at `http://localhost:<port>`. The server runs as a separate detached process, identical to `pi-dashboard start`.

**Why:** Running the server in-process means restarting the server requires restarting Electron (losing window state, DevTools). It also creates port conflicts with CLI-started servers and kills all bridge connections when the window closes. A detached server survives Electron quit, matches the existing architecture, and avoids split-brain issues.

**Alternative considered:** In-process server with IPC — rejected because it couples server lifecycle to the window and breaks the "server outlives clients" model that bridges depend on.

### D2: Bundled Node.js for dependency bootstrapping

**Decision:** Ship a standalone Node.js v22 LTS binary as Electron `extraResources`. Use it to `npm install` pi, the dashboard package, openspec, and tsx into `~/.pi-dashboard/node_modules/` at first run.

**Why:** Guarantees the app works on a fresh machine with no prerequisites. System Node.js is detected first and preferred; bundled Node is the fallback.

**Stripping bundled Node:** Ship only `bin/node` (or `node.exe`) and `lib/node_modules/npm/` — skip man pages, docs, headers, and `corepack`. Reduces ~130MB to ~95MB per platform.

**Alternative considered:** Require system Node.js — rejected because it's the exact barrier we're trying to eliminate.

### D2a: Two installation modes (first-run choice)

**Decision:** The first-run wizard asks the user to choose between two modes:

1. **Standalone mode** ("Set up everything for me") — for users on fresh machines or who want a self-contained setup:
   - Installs pi, the dashboard package (`@blackbelt-technology/pi-dashboard`), openspec, and tsx into `~/.pi-dashboard/node_modules/`
   - Adds `~/.pi-dashboard/node_modules/.bin` to PATH for spawned processes
   - The dashboard package installation registers the bridge extension with pi via its `package.json` `pi.extensions` field
   - Server spawned using bundled or managed Node + tsx as TS loader

2. **Power user mode** ("Use my existing pi installation") — for users who already have pi installed globally:
   - Detects system pi and openspec on PATH
   - Verifies the dashboard package is installed in pi's package system (`~/.pi/agent/settings.json` packages or global npm)
   - If the dashboard package is missing, offers to install it via `npm install -g @blackbelt-technology/pi-dashboard` or add to pi's settings.json packages
   - Server spawned using system Node + jiti (from pi) as TS loader

**Why two modes:** A single "auto-detect" path would be fragile — system pi without the dashboard package means the bridge extension won't load, which breaks everything silently. Explicit choice surfaces the right setup questions at the right time.

### D2b: TypeScript loader resolution for server spawning

**Decision:** When Electron spawns the dashboard server, the TS loader is resolved based on installation mode:
- **Standalone mode:** Uses tsx from managed install (`~/.pi-dashboard/node_modules/tsx`)
- **Power user mode:** Uses jiti from pi's install (existing `resolveJitiImport()` logic), falls back to tsx

**Analysis:** The server has zero imports from pi's `virtualModules` (the jiti fork's key feature). All pi imports in the server are either dynamic (`import()` in package-manager-wrapper) or compiled `.js` targets. tsx is fully compatible as a TS loader for the server. The bridge extension runs inside pi's process and always uses pi's jiti — this is unaffected.

**Alternative considered:** Pre-compile server to JS during Electron build — rejected because it adds a build step and diverges from the development workflow where the server runs TypeScript directly.

### D3: Server identity detection via health check

**Decision:** Replace bare TCP port probes (`isPortOpen`) with `isDashboardRunning(port)` which calls `GET /api/health` and verifies the response contains `{ ok: true }`. Used by Electron startup, bridge auto-start, and CLI status/start.

**Why:** A bare TCP probe can't distinguish the dashboard from another service on the same port (e.g., Rails dev server, another Node app). This is a pre-existing bug that Electron makes more critical — we must know definitively whether the dashboard is running before deciding to launch another instance.

**Fallback chain:**
1. `GET http://localhost:<port>/api/health` → check `{ ok: true, pid }` → dashboard confirmed
2. HTTP response but wrong format → port conflict with another service → error
3. Connection refused → no server → launch one

### D4: electron-forge with Vite plugin

**Decision:** Use `@electron-forge/cli` with `@electron-forge/plugin-vite` for building and packaging. This reuses the existing Vite config for the renderer.

**Why:** electron-forge is Electron's official build tool. The Vite plugin aligns with the project's existing Vite setup. electron-builder is an alternative but has more complex configuration.

**Build targets:**
- macOS: `.dmg` via `@electron-forge/maker-dmg` (universal binary, arm64 + x64 combined)
- Linux: `.deb` + `.AppImage` via makers
- Windows: `.exe` via `@electron-forge/maker-squirrel` (NSIS)

### D5: node-pty native rebuild strategy

**Decision:** Rebuild node-pty against Electron's Node ABI using `@electron/rebuild` as a forge hook. CI builds on platform-specific runners.

**Terminal feature in Electron:** Terminal sessions use node-pty in the **server process** (which runs system Node, not Electron Node). Since D1 keeps the server as a detached process using system Node, node-pty in the server works as-is. Electron's renderer connects to the server's terminal WebSocket — no rebuild needed for that path.

**Implication:** node-pty rebuild may only be needed if we want terminals to work even when there's no external server (future enhancement). For MVP, the server handles PTY allocation.

### D6: Dependency auto-update check

**Decision:** On app launch (and every 24h while running), check for newer versions of pi and openspec. If available, show a non-blocking notification with an "Update" button. Update runs `npm install <package>@latest` using the same Node/npm that installed it.

**Why:** pi and openspec evolve rapidly. Users of the desktop app may not check for updates manually. A gentle prompt keeps them current without forcing updates.

## Risks / Trade-offs

### [Risk] Bundled Node.js version drift → Mitigation: LTS + periodic refresh
Bundled Node v22 LTS is supported until April 2027. pi requires ≥20.6, openspec requires ≥20.19. Shipping v22 provides headroom. App updates can bump the bundled version.

### [Risk] Bundle size ~250MB → Mitigation: acceptable for desktop apps
Comparable to VS Code (~350MB), Cursor (~450MB), Slack (~300MB). Could be reduced by stripping Node docs/headers.

### [Risk] Code signing cost → Mitigation: defer Windows EV cert
macOS signing requires Apple Developer ($99/year). Windows EV cert costs $200-400/year. MVP skips Windows signing. macOS signing is essential to avoid Gatekeeper rejection.

### [Risk] Two Node.js runtimes (bundled + system) → Mitigation: prefer system
If the user has system Node, use it for everything. Bundled Node is only the bootstrap fallback.

### [Risk] Port conflict with another service → Mitigation: health-check identity
`isDashboardRunning()` verifies server identity via `/api/health`. If port is occupied by another service, Electron shows a clear error: "Port X is in use by another service. Change the dashboard port in settings."

## Resolved Questions

1. **macOS universal binary vs separate builds?** → **Universal binary.** Simpler for users, one download.

2. **System tray on window close?** → **Yes.** Minimize to system tray, keep server running, quick reopen via tray icon. "Quit" is an explicit tray menu action.

3. **App auto-updater in MVP?** → **Yes.** Use `electron-updater` with GitHub Releases from the start.

4. **spawnStrategy default change?** → **Change to `"headless"` globally** for all users (CLI and Electron). tmux is no longer the default. Existing users with explicit `"tmux"` in config are unaffected.

5. **Windows code signing?** → **Skip for MVP.** Users will see "unknown publisher" warning. macOS signing is included (required for Gatekeeper).
