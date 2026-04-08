## 1. Config Changes

- [ ] 1.1 Add `electronMode` field to `DashboardConfig` in `src/shared/config.ts` with default `false`
- [ ] 1.2 Change `spawnStrategy` default from `"tmux"` to `"headless"` and update invalid-value fallback
- [ ] 1.3 Update `process-manager.ts` to force headless when `electronMode` is true
- [ ] 1.4 Add `~/.pi-dashboard/node_modules/.bin` to PATH in spawned process env in `process-manager.ts`
- [ ] 1.5 Write tests for new config fields and electron-mode spawn override

## 2. Dependency Installer Module

- [ ] 2.1 Create `electron/lib/dependency-detector.ts` — `detectPi()`, `detectOpenSpec()`, `detectDashboardPackage()`, `detectSystemNode()` functions with system PATH → managed install detection chain
- [ ] 2.2 Create `electron/lib/dependency-installer.ts` — `installStandalone()` (pi + dashboard + openspec + tsx into `~/.pi-dashboard/`), `installDashboardGlobal()` (for power user mode)
- [ ] 2.3 Create `electron/lib/bundled-node.ts` — `getBundledNodePath()`, `getBundledNpmPath()` resolving extraResources paths
- [ ] 2.4 Create `electron/lib/ts-loader-resolver.ts` — `resolveTsLoader(mode)` returning tsx path (standalone) or jiti-first-then-tsx (power user)
- [ ] 2.5 Write tests for detection, installation, and TS loader resolution

## 3. First-Run Wizard

- [ ] 3.1 Create `electron/renderer/FirstRunWizard.tsx` — multi-step wizard component (mode selection → install/verify → API key → done)
- [ ] 3.2 Implement mode selection step: "Set up everything for me" (standalone) vs "Use my existing pi" (power user)
- [ ] 3.3 Implement standalone install step — progress indicators for pi, dashboard, openspec, tsx
- [ ] 3.4 Implement power user verification step — check pi, openspec, dashboard bridge; offer to fix gaps
- [ ] 3.5 Implement API key configuration step — write to `~/.pi/agent/settings.json`, skip if already configured
- [ ] 3.6 Add first-run detection logic: check `~/.pi-dashboard/mode.json` presence
- [ ] 3.7 Persist mode to `~/.pi-dashboard/mode.json` on completion
- [ ] 3.8 Wire wizard into Electron main process — show wizard window before dashboard if first-run detected

## 4. Electron Shell

- [ ] 4.1 Create `electron/` directory structure: `main.ts`, `preload.ts`, `forge.config.ts`
- [ ] 4.2 Implement `electron/main.ts` — single-instance lock, server detection (mDNS if available, fallback to `isDashboardRunning()`), launch server if needed, BrowserWindow creation pointing at server URL
- [ ] 4.3 Implement window state persistence (size, position) across restarts
- [ ] 4.4 Implement system tray — minimize to tray on window close, tray icon with "Show" and "Quit" menu, reopen window on tray click
- [ ] 4.5 Implement `app.quit()` (via tray "Quit") — optionally stop server if Electron started it
- [ ] 4.6 Add `ELECTRON_DEV` mode — skip server discovery, point at `http://localhost:8000`
- [ ] 4.7 Write tests for main process lifecycle logic

## 5. Dependency Auto-Update

- [ ] 5.1 Create `electron/lib/update-checker.ts` — check `npm outdated` for pi and openspec, return available versions
- [ ] 5.2 Implement 24-hour check interval with on-launch trigger
- [ ] 5.3 Create update notification UI component in dashboard (non-blocking banner with "Update" button)
- [ ] 5.4 Implement update execution — run `npm install <package>@latest` using appropriate npm (system vs managed)
- [ ] 5.5 Write tests for update detection and execution

## 6. Build Pipeline

- [ ] 6.1 Add Electron dev dependencies: `electron`, `@electron-forge/cli`, `@electron-forge/plugin-vite`, `@electron/rebuild`, platform makers
- [ ] 6.2 Configure `forge.config.ts` with makers for macOS (dmg universal), Linux (deb, AppImage), Windows (squirrel)
- [ ] 6.3 Add Node.js binary download script for build — fetch correct platform binary, strip to node + npm only
- [ ] 6.4 Configure `extraResources` to include stripped Node.js binary per platform
- [ ] 6.5 Add npm scripts: `electron:dev`, `electron:make`, `electron:start`
- [ ] 6.6 Create GitHub Actions workflow: build matrix (macOS universal, ubuntu-latest x64, windows-latest x64), produce artifacts
- [ ] 6.7 Configure macOS code signing (Apple Developer ID) in CI (Windows signing deferred)
- [ ] 6.8 Test packaged app on each platform — verify server launch, pi install, wizard flow

## 7. App Auto-Updater

- [ ] 7.1 Add `electron-updater` dependency
- [ ] 7.2 Configure `electron-updater` with GitHub Releases as update source in `forge.config.ts`
- [ ] 7.3 Implement update check on launch + periodic check (every 24h)
- [ ] 7.4 Create update notification UI — non-blocking banner with "Download & Restart" button
- [ ] 7.5 Write tests for update check and download flow
