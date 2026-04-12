## ADDED Requirements

### Requirement: Electron main process lifecycle
The Electron main process SHALL discover or launch a dashboard server, then open a BrowserWindow pointing at the server URL. The server SHALL always run as a separate detached process, never in-process.

#### Scenario: Launch with no server running
- **WHEN** the Electron app starts and no dashboard server is discovered (mDNS via `@blackbelt-technology/pi-dashboard-shared/mdns-discovery` + health check fallback via `@blackbelt-technology/pi-dashboard-shared/server-identity`)
- **THEN** it SHALL launch the server as a detached process using the `tsx` binary and open a BrowserWindow pointing at `http://localhost:<port>` once the server is ready

#### Scenario: Launch with server already running
- **WHEN** the Electron app starts and a localhost dashboard server is discovered
- **THEN** it SHALL skip server launch and open a BrowserWindow pointing at the discovered server URL

#### Scenario: Window close behavior
- **WHEN** the user closes the Electron window
- **THEN** the app SHALL minimize to the system tray (server keeps running)

#### Scenario: Server launch failure with retry
- **WHEN** the server fails to start
- **THEN** the app SHALL show an error dialog with the failure reason and offer "Run Setup", "Retry", or "Quit" options
- **AND** if all retry attempts fail, it SHALL show a loading page that keeps polling and displays connection instructions

### Requirement: Loading page with connection retry
The app SHALL show a branded loading page while waiting for the server to become available.

#### Scenario: Loading page displays
- **WHEN** the BrowserWindow opens before the server is ready
- **THEN** it SHALL show a dark-themed page with the π symbol and "Connecting to dashboard..." animation

#### Scenario: Loading page shows error after timeout
- **WHEN** the server is not available after ~15 seconds
- **THEN** the loading page SHALL show connection error details with installation instructions
- **AND** it SHALL continue retrying in the background and auto-redirect when the server becomes available

### Requirement: Single-instance lock
The Electron app SHALL use `app.requestSingleInstanceLock()` to prevent multiple Electron windows from running simultaneously.

#### Scenario: Second instance launched
- **WHEN** a second Electron instance is launched
- **THEN** it SHALL focus the existing window and exit the second instance

### Requirement: BrowserWindow configuration
The BrowserWindow SHALL load the dashboard server URL with appropriate settings for a desktop app experience.

#### Scenario: Window opens with dashboard
- **WHEN** the BrowserWindow is created
- **THEN** it SHALL load `http://localhost:<port>` with `nodeIntegration: false`, `contextIsolation: true`, and title "PI Dashboard"
- **AND** it SHALL persist window size and position across restarts

### Requirement: System tray integration
The app SHALL show a system tray icon with a context menu when the window is closed. The tray SHALL use a platform-appropriate icon image.

#### Scenario: Tray icon menu
- **WHEN** the window is minimized to tray
- **THEN** the tray SHALL show a context menu with "Show" and "Quit" options

#### Scenario: Tray click reopens window
- **WHEN** the user clicks the tray icon
- **THEN** the window SHALL be shown and focused

#### Scenario: Quit stops server if we started it
- **WHEN** the user clicks "Quit" in the tray menu and Electron started the server
- **THEN** it SHALL stop the server before exiting

#### Scenario: macOS tray uses template image
- **WHEN** the tray is created on macOS
- **THEN** it SHALL load `trayTemplate.png` from the resources directory (auto-adapts to dark/light menu bar)

#### Scenario: Windows/Linux tray uses app icon
- **WHEN** the tray is created on Windows or Linux
- **THEN** it SHALL load `icon.ico` or `icon.png` from the resources directory

### Requirement: macOS application menu
The Electron app SHALL set up a native macOS application menu with standard menu items.

#### Scenario: App menu structure on macOS
- **WHEN** the app starts on macOS
- **THEN** the application menu SHALL include: App name menu (About, Doctor, Separator, Quit), Edit (Undo, Cut, Copy, Paste, Select All), View (Reload, Toggle DevTools), Window (Minimize, Close)

#### Scenario: About dialog
- **WHEN** the user selects "About PI Dashboard" from the app menu
- **THEN** a native dialog SHALL display the app name, version number (from `app.getVersion()`), and copyright text

#### Scenario: App menu on Windows/Linux
- **WHEN** the app starts on Windows or Linux
- **THEN** a minimal Help menu SHALL be set with "Doctor..." and "About" items

### Requirement: Doctor diagnostic function
The app SHALL provide a Doctor function accessible from the app menu that checks all required components.

#### Scenario: Doctor checks all components
- **WHEN** the user opens "Doctor..." from the menu
- **THEN** it SHALL check: Electron version, system Node.js, bundled Node.js, bundled npm, pi CLI, openspec CLI, dashboard server code, TypeScript loader (tsx), dashboard server status, setup wizard state, API key configuration, and managed install directory
- **AND** each check SHALL report status (ok/warning/error), version, and path

#### Scenario: Doctor offers setup for errors
- **WHEN** the Doctor report contains fixable errors
- **THEN** the dialog SHALL offer a "Run Setup" button that triggers the setup wizard

### Requirement: VM GPU detection
The app SHALL auto-detect virtual machine environments and disable GPU acceleration to prevent white screen rendering issues.

#### Scenario: VMware detection on macOS
- **WHEN** the app starts on macOS and `sysctl -n hw.model` contains "VMware", "VirtualBox", or "Parallels"
- **THEN** it SHALL call `app.disableHardwareAcceleration()` and append `--disable-gpu` switch

#### Scenario: VM detection on Linux
- **WHEN** the app starts on Linux and `systemd-detect-virt` returns a non-"none" value
- **THEN** it SHALL disable hardware acceleration

#### Scenario: Manual GPU disable
- **WHEN** the `ELECTRON_DISABLE_GPU` environment variable is set
- **THEN** it SHALL disable hardware acceleration regardless of platform

### Requirement: Dev mode for Electron
When the `ELECTRON_DEV` environment variable is set, the Electron app SHALL connect to an externally running server without launching one, enabling the existing dev workflow.

#### Scenario: Dev mode skips server launch
- **WHEN** `ELECTRON_DEV=1` is set
- **THEN** the Electron app SHALL open a BrowserWindow pointing at `http://localhost:8000` with the loading page retry mechanism

### Requirement: Server launch via tsx binary
The server SHALL be launched using the `tsx` binary (not `node --import tsx/esm`) to ensure proper `__dirname`/`__filename` shimming for CJS dependencies.

#### Scenario: tsx binary resolution
- **WHEN** the server needs to be launched
- **THEN** it SHALL find the `tsx` binary in `~/.pi-dashboard/node_modules/.bin/tsx` (managed) or system PATH

#### Scenario: Server launch with tsx
- **WHEN** launching the server
- **THEN** it SHALL spawn `tsx <cli.ts> --port <port> --pi-port <piPort>` with NODE_PATH including the bundled server's node_modules

#### Scenario: Server launch logging
- **WHEN** the server is launched
- **THEN** it SHALL write launch diagnostics and server output to `~/.pi-dashboard/server.log`
