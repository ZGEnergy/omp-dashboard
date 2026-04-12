## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: macOS application menu
The Electron app SHALL set up a native macOS application menu with standard menu items.

#### Scenario: App menu structure
- **WHEN** the app starts on macOS
- **THEN** the application menu SHALL include: App name menu (About, Separator, Quit), Edit (Undo, Cut, Copy, Paste, Select All), View (Reload, Toggle DevTools), Window (Minimize, Close)

#### Scenario: About dialog
- **WHEN** the user selects "About PI Dashboard" from the app menu
- **THEN** a native dialog SHALL display the app name, version number (from `app.getVersion()`), and copyright text

#### Scenario: Non-macOS platforms
- **WHEN** the app starts on Windows or Linux
- **THEN** no custom application menu SHALL be set (default Electron menu behavior)
