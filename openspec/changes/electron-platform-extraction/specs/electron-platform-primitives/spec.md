## ADDED Requirements

### Requirement: Tray icon resolution by platform

The system SHALL provide `getTrayIcon(opts?: { platform?: NodeJS.Platform; resourcesDir?: string }): string` in `packages/electron/src/platform/tray-icon.ts` that returns the absolute path to the correct tray icon asset for the given platform. Default `platform` MUST be `process.platform`. The function MUST be pure (no Electron API imports, no side effects).

#### Scenario: macOS returns template icon
- **WHEN** `getTrayIcon({ platform: "darwin", resourcesDir: "/r" })` is called
- **THEN** the result MUST end with `trayTemplate.png`

#### Scenario: Windows returns ICO
- **WHEN** `getTrayIcon({ platform: "win32", resourcesDir: "/r" })` is called
- **THEN** the result MUST end with `.ico`

#### Scenario: Linux returns PNG
- **WHEN** `getTrayIcon({ platform: "linux", resourcesDir: "/r" })` is called
- **THEN** the result MUST end with `.png` and MUST NOT be the macOS template icon

#### Scenario: Default platform falls through to process.platform
- **WHEN** `getTrayIcon()` is called with no platform arg
- **THEN** the function MUST use `process.platform` for branch selection

### Requirement: Bundled Node binary path by platform

The system SHALL provide `getBundledNodePath(opts?: { platform?: NodeJS.Platform; resourcesDir?: string }): string` in `packages/electron/src/platform/node.ts` returning the absolute path to the bundled Node.js binary inside Electron resources. Default `platform` MUST be `process.platform`.

#### Scenario: Windows returns node.exe
- **WHEN** `getBundledNodePath({ platform: "win32", resourcesDir: "/r" })` is called
- **THEN** the result MUST end with `node.exe`

#### Scenario: Non-Windows returns bare node
- **WHEN** `getBundledNodePath({ platform: "darwin" | "linux", resourcesDir: "/r" })` is called
- **THEN** the result MUST end with `node` (no extension)

### Requirement: App-menu template construction

The system SHALL provide `buildAppMenu(opts?: { platform?: NodeJS.Platform; … }): Menu` in `packages/electron/src/platform/menu.ts` that constructs the Electron `Menu` with platform-correct prefix. On `darwin`, the menu MUST include the macOS-conventional app menu (App name → About / Quit) as the first submenu. On non-darwin platforms, the menu MUST NOT include that prefix.

#### Scenario: macOS menu has app submenu first
- **WHEN** `buildAppMenu({ platform: "darwin" })` is called
- **THEN** the returned menu's first item MUST be the app submenu containing About and Quit

#### Scenario: Linux/Windows menu omits app submenu
- **WHEN** `buildAppMenu({ platform: "linux" | "win32" })` is called
- **THEN** the returned menu MUST NOT include an app-name submenu prefix

### Requirement: App lifecycle configuration

The system SHALL provide `configureAppLifecycle(app: Electron.App, opts?: { platform?: NodeJS.Platform; getMainWindow: () => BrowserWindow | null; isQuitting: () => boolean }): void` in `packages/electron/src/platform/app-lifecycle.ts` that registers all platform-conditional lifecycle handlers in a single call. The function MUST register:

1. **Linux ozone-platform-hint**: when `platform === "linux"` and `process.env.ELECTRON_OZONE_PLATFORM_HINT` is unset, append the `ozone-platform-hint=auto` command-line switch via `app.commandLine.appendSwitch`.
2. **Darwin dock-hide on close**: when `platform === "darwin"`, intercept main-window close to hide the app via `app.dock.hide()` instead of quitting (unless `isQuitting()` returns true).
3. **Darwin window-all-closed gate**: when `platform !== "darwin"`, register a `window-all-closed` handler that quits when no main window remains and the app is not starting up.

The function MUST be idempotent across calls in tests (no double-registration leaks).

#### Scenario: Linux registers ozone hint when env unset
- **WHEN** `configureAppLifecycle(app, { platform: "linux" })` runs and `process.env.ELECTRON_OZONE_PLATFORM_HINT` is unset
- **THEN** `app.commandLine.appendSwitch` MUST be called with `("ozone-platform-hint", "auto")`

#### Scenario: Linux skips ozone hint when env preset
- **WHEN** `configureAppLifecycle(app, { platform: "linux" })` runs and `process.env.ELECTRON_OZONE_PLATFORM_HINT === "x11"`
- **THEN** `app.commandLine.appendSwitch` MUST NOT be called for ozone-platform-hint

#### Scenario: macOS hides dock instead of quitting on window close
- **WHEN** the main window emits `close` and `isQuitting()` returns false on `platform === "darwin"`
- **THEN** the close MUST be prevented and `app.dock.hide()` MUST be called

#### Scenario: macOS allows quit when isQuitting is true
- **WHEN** the main window emits `close` and `isQuitting()` returns true on `platform === "darwin"`
- **THEN** the close MUST proceed (no `preventDefault`) and `app.dock.hide()` MUST NOT be called

#### Scenario: Non-darwin window-all-closed quits app
- **WHEN** the `window-all-closed` event fires, `getMainWindow()` returns null, app is not starting up, and `platform !== "darwin"`
- **THEN** `app.quit()` MUST be called

#### Scenario: Darwin window-all-closed does not quit
- **WHEN** the `window-all-closed` event fires on `platform === "darwin"`
- **THEN** `app.quit()` MUST NOT be called from this handler

### Requirement: Module barrel export

The system SHALL provide `packages/electron/src/platform/index.ts` re-exporting the public API: `getTrayIcon`, `getBundledNodePath`, `buildAppMenu`, `configureAppLifecycle`. Callers SHOULD import from the barrel.

#### Scenario: Barrel exports all primitives
- **WHEN** a consumer imports from `packages/electron/src/platform/index.js`
- **THEN** all four named exports MUST be available

### Requirement: Caller migration

All four pre-existing call sites SHALL be migrated to consume the new `platform/` module:

1. `packages/electron/src/lib/tray.ts` — replace inline darwin/win32/linux icon-path branch with `getTrayIcon()` call.
2. `packages/electron/src/lib/bundled-node.ts` — replace inline `node.exe`/`node` branch with `getBundledNodePath()` call.
3. `packages/electron/src/lib/app-menu.ts` — replace inline darwin template prefix with delegation into `buildAppMenu()`.
4. `packages/electron/src/main.ts` — replace the three inline lifecycle branches (ozone-hint, dock-hide on close, window-all-closed gate) with a single `configureAppLifecycle(app, …)` call.

After migration, the only remaining `process.platform` reference in `packages/electron/src/main.ts` outside `platform/` MAY be the diagnostic log statement at startup (`log("platform=…")`).

#### Scenario: lib/tray.ts contains no platform branch
- **WHEN** `packages/electron/src/lib/tray.ts` is read after migration
- **THEN** it MUST NOT contain `process.platform === "darwin"` or `process.platform === "win32"` or `process.platform === "linux"` branches; icon resolution MUST go through `getTrayIcon()`

#### Scenario: lib/bundled-node.ts contains no platform branch
- **WHEN** `packages/electron/src/lib/bundled-node.ts` is read after migration
- **THEN** it MUST NOT contain a `process.platform === "win32"` branch; binary path MUST go through `getBundledNodePath()`

#### Scenario: main.ts has single lifecycle configuration call
- **WHEN** `packages/electron/src/main.ts` is read after migration
- **THEN** the three lifecycle-related platform branches (ozone-hint, dock-hide, window-all-closed) MUST be replaced by exactly one `configureAppLifecycle(app, …)` invocation

### Requirement: Documentation update

The system SHALL extend `docs/architecture.md` "Cross-OS Platform Primitives" section with a subsection describing `packages/electron/src/platform/` as the Electron-API-bound companion module. `AGENTS.md` SHALL gain a one-line Key Files entry pointing to `packages/electron/src/platform/`.

#### Scenario: Architecture doc references companion module
- **WHEN** `docs/architecture.md` is read after migration
- **THEN** the "Cross-OS Platform Primitives" section MUST mention `packages/electron/src/platform/` and explain why it cannot live in shared

#### Scenario: AGENTS.md lists the new module
- **WHEN** `AGENTS.md` is read after migration
- **THEN** the Key Files table MUST contain a row for `packages/electron/src/platform/` (≤200 chars per repo convention)

### Requirement: Smoke verification

A manual Electron build smoke test SHALL be performed on at least one OS (macOS preferred, since it exercises the most platform-specific code paths) before merge. The test MUST verify: (a) `cd packages/electron && npm run make` exits 0; (b) the produced app launches; (c) the tray icon is visible; (d) the About menu item appears (macOS); (e) the bundled server boots successfully (proves `getBundledNodePath`); (f) closing the main window hides the dock on macOS instead of quitting.

#### Scenario: Smoke test passes on macOS
- **WHEN** the migration is complete and `npm run make` is run on macOS
- **THEN** the build MUST succeed and the launched app MUST exhibit all six behaviors above
