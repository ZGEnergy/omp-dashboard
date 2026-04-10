## ADDED Requirements

### Requirement: Electron main process lifecycle
The Electron main process SHALL discover or launch a dashboard server, then open a BrowserWindow pointing at the server URL. The server SHALL always run as a separate detached process, never in-process.

#### Scenario: Launch with no server running
- **WHEN** the Electron app starts and no dashboard server is discovered (mDNS via `@blackbelt-technology/pi-dashboard-shared/mdns-discovery` + health check fallback via `@blackbelt-technology/pi-dashboard-shared/server-identity`)
- **THEN** it SHALL launch the server as a detached process and open a BrowserWindow pointing at `http://localhost:<port>` once the server is ready

#### Scenario: Launch with server already running
- **WHEN** the Electron app starts and a localhost dashboard server is discovered
- **THEN** it SHALL skip server launch and open a BrowserWindow pointing at the discovered server URL

#### Scenario: Window close behavior
- **WHEN** the user closes the Electron window
- **THEN** the app SHALL minimize to the system tray (server keeps running)

### Requirement: Single-instance lock
The Electron app SHALL use `app.requestSingleInstanceLock()` to prevent multiple Electron windows from running simultaneously.

#### Scenario: Second instance launched
- **WHEN** a second Electron instance is launched
- **THEN** it SHALL focus the existing window and exit the second instance

### Requirement: BrowserWindow configuration
The BrowserWindow SHALL load the dashboard server URL with appropriate settings for a desktop app experience.

#### Scenario: Window opens with dashboard
- **WHEN** the BrowserWindow is created
- **THEN** it SHALL load `http://localhost:<port>` with `nodeIntegration: false` and `contextIsolation: true`
- **AND** it SHALL persist window size and position across restarts

### Requirement: System tray integration
The app SHALL show a system tray icon with a context menu when the window is closed.

#### Scenario: Tray icon menu
- **WHEN** the window is minimized to tray
- **THEN** the tray SHALL show a context menu with "Show" and "Quit" options

#### Scenario: Tray click reopens window
- **WHEN** the user clicks the tray icon
- **THEN** the window SHALL be shown and focused

#### Scenario: Quit stops server if we started it
- **WHEN** the user clicks "Quit" in the tray menu and Electron started the server
- **THEN** it SHALL stop the server before exiting

### Requirement: Dev mode for Electron
When the `ELECTRON_DEV` environment variable is set, the Electron app SHALL connect to an externally running server without launching one, enabling the existing dev workflow.

#### Scenario: Dev mode skips server launch
- **WHEN** `ELECTRON_DEV=1` is set
- **THEN** the Electron app SHALL open a BrowserWindow pointing at `http://localhost:8000` without attempting to discover or launch a server
