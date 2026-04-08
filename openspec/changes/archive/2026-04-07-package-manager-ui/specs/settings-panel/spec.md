## MODIFIED Requirements

### Requirement: Settings panel displays configurable dashboard options
The settings panel SHALL include a "Packages" section for managing globally installed pi packages. This section SHALL display the list of installed global packages with uninstall and update buttons, and a "Browse Packages" button that opens the PackageBrowser in global scope.

#### Scenario: View global packages in settings
- **WHEN** user opens the Settings panel
- **THEN** a "Packages" section shows all globally installed pi packages

#### Scenario: Browse packages from settings
- **WHEN** user clicks "Browse Packages" in the settings Packages section
- **THEN** the PackageBrowser opens in global scope for searching and installing packages

#### Scenario: Uninstall from settings
- **WHEN** user clicks "Uninstall" on an installed global package
- **THEN** the package is removed via `POST /api/packages/remove` with `scope: "global"`

#### Scenario: Update from settings
- **WHEN** user clicks "Update" on an installed global package
- **THEN** the package is updated via `POST /api/packages/update` with the package source and `scope: "global"`
