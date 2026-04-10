## Context

The pi-dashboard is now a **monorepo** with npm workspaces: `packages/client` (React web UI), `packages/server` (HTTP + WebSocket), `packages/extension` (pi bridge), `packages/shared` (types, config, mDNS, identity), and `packages/dist` (built client assets). It's distributed as an npm package requiring manual installation of Node.js, pi, and openspec.

Server discovery via mDNS and identity-verified health checks are already implemented (`packages/shared/src/mdns-discovery.ts`, `packages/shared/src/server-identity.ts`). The `spawnStrategy` default is already `"headless"`. CORS support is in place for cross-origin clients. The `ServerSelector` component already exists.

The goal is to add an Electron desktop wrapper that works on a fresh machine, leveraging existing infrastructure.

## Goals / Non-Goals

**Goals:**
- Single-click install desktop app for macOS, Linux, Windows
- Zero prerequisites on a fresh machine — bundled Node.js bootstraps pi/openspec installation
- Two installation modes: standalone (everything managed) and power user (existing pi)
- Coexistence with the existing CLI + browser workflow
- CI pipeline producing signed installers for all platforms

**Non-Goals:**
- Embedding the pi CLI inside the Electron bundle (pi is installed at runtime via npm)
- Running the dashboard server in-process within Electron (server is always a detached process)
- Replacing the web-based dashboard (Electron is an additional entry point)
- Mobile Electron builds (web/PWA already covers mobile)

## Decisions

### D1: Electron as smart window, not in-process server

**Decision:** Electron opens a BrowserWindow pointing at `http://localhost:<port>`. The server runs as a separate detached process, identical to `pi-dashboard start`.

**Why:** Running the server in-process means restarting the server requires restarting Electron (losing window state, DevTools). It also creates port conflicts with CLI-started servers and kills all bridge connections when the window closes. A detached server survives Electron quit, matches the existing architecture, and avoids split-brain issues.

### D2: Bundled Node.js for dependency bootstrapping

**Decision:** Ship a standalone Node.js v22 LTS binary as Electron `extraResources`. Use it to `npm install` pi, the dashboard package, openspec, and tsx into `~/.pi-dashboard/node_modules/` at first run.

**Stripping bundled Node:** Ship only `bin/node` (or `node.exe`) and `lib/node_modules/npm/` — skip man pages, docs, headers, and `corepack`. Reduces ~130MB to ~95MB per platform.

### D2a: Two installation modes (first-run choice)

**Decision:** The first-run wizard asks the user to choose between two modes:

1. **Standalone mode** ("Set up everything for me"):
   - Installs pi, the dashboard package (`@blackbelt-technology/pi-dashboard`), openspec, and tsx into `~/.pi-dashboard/node_modules/`
   - Adds `~/.pi-dashboard/node_modules/.bin` to PATH for spawned processes
   - The dashboard package installation registers the bridge extension with pi via its `package.json` `pi.extensions` field
   - Server spawned using bundled or managed Node + tsx as TS loader

2. **Power user mode** ("Use my existing pi installation"):
   - Detects system pi and openspec on PATH
   - Verifies the dashboard package is installed in pi's package system
   - If the dashboard package is missing, offers to install it
   - Server spawned using system Node + jiti (from pi) as TS loader

### D2b: TypeScript loader resolution for server spawning

**Decision:** When Electron spawns the dashboard server, the TS loader is resolved based on installation mode:
- **Standalone mode:** Uses tsx from managed install (`~/.pi-dashboard/node_modules/tsx`)
- **Power user mode:** Uses jiti from pi's install (existing `resolveJitiImport()` logic), falls back to tsx

**Analysis:** The server has zero imports from pi's `virtualModules` (the jiti fork's key feature). tsx is fully compatible as a TS loader for the server.

### D3: Server discovery uses existing infrastructure

**Decision:** Electron startup uses the same mDNS discovery + health-check fallback already implemented in `packages/shared/src/mdns-discovery.ts` and `packages/shared/src/server-identity.ts`.

**Flow:**
1. mDNS browse `_pi-dashboard._tcp` (2s timeout)
2. Fallback: `isDashboardRunning(config.port)` health check
3. If neither finds a server → launch as detached process
4. Open BrowserWindow pointing at discovered/launched server

### D4: New workspace `packages/electron`

**Decision:** The Electron app lives in `packages/electron/` following the monorepo pattern. It depends on `@blackbelt-technology/pi-dashboard-shared` for discovery utilities and `@blackbelt-technology/pi-dashboard-web` for the built client assets.

**Why:** Consistent with the existing `packages/*` structure. The electron workspace has its own `package.json` with Electron-specific deps (`electron`, `@electron-forge/*`, `electron-updater`).

### D5: electron-forge with Vite plugin

**Decision:** Use `@electron-forge/cli` with `@electron-forge/plugin-vite`.

**Build targets:**
- macOS: `.dmg` via `@electron-forge/maker-dmg` (universal binary, arm64 + x64 combined)
- Linux: `.deb` + `.AppImage` via makers
- Windows: `.exe` via `@electron-forge/maker-squirrel` (NSIS)

### D6: node-pty runs in server process, not Electron

**Decision:** Terminal sessions use node-pty in the **server process** (system Node). Since the server is a separate detached process, node-pty works without Electron-specific rebuilding. No `@electron/rebuild` needed for MVP.

### D7: Dependency auto-update check

**Decision:** On app launch (and every 24h while running), check for newer versions of pi and openspec. Show a non-blocking notification with an "Update" button.

## Risks / Trade-offs

### [Risk] Bundled Node.js version drift → Mitigation: LTS + periodic refresh
Bundled Node v22 LTS is supported until April 2027. pi requires ≥20.6, openspec requires ≥20.19. App updates can bump the bundled version.

### [Risk] Bundle size ~250MB → Mitigation: acceptable for desktop apps
Comparable to VS Code (~350MB), Cursor (~450MB), Slack (~300MB).

### [Risk] Code signing cost → Mitigation: defer Windows EV cert
macOS signing ($99/year) is essential. Windows EV cert ($200-400/year) deferred for MVP.

### [Risk] Two Node.js runtimes (bundled + system) → Mitigation: prefer system
If the user has system Node, use it. Bundled Node is only the bootstrap fallback.

## Resolved Questions

1. **macOS universal binary vs separate builds?** → **Universal binary.** Simpler for users.
2. **System tray on window close?** → **Yes.** Minimize to tray, quick reopen.
3. **App auto-updater in MVP?** → **Yes.** `electron-updater` + GitHub Releases.
4. **spawnStrategy default?** → Already changed to `"headless"` globally (prior work).
5. **Windows code signing?** → **Skip for MVP.**
