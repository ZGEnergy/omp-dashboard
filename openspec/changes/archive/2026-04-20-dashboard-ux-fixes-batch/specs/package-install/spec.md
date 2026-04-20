## MODIFIED Requirements

### Requirement: Package card reflects install state immediately
After a package install, remove, or update operation completes successfully, ALL instances of the installed packages list SHALL refresh automatically. The `useInstalledPackages` hook SHALL listen for `pi-package-event` DOM events and re-fetch the installed packages list when any operation completes with `success: true`.

#### Scenario: Install from browse updates card to installed state
- **WHEN** a package is installed via the Browse Packages section
- **THEN** the PackageCard for that package immediately shows "Installed" status
- **AND** no manual page refresh is required

#### Scenario: Uninstall updates card to uninstalled state
- **WHEN** a package is uninstalled from the Installed Packages section
- **THEN** the PackageCard in Browse Packages immediately shows the Install button
- **AND** no manual page refresh is required

#### Scenario: Cross-component state sync
- **WHEN** an install operation is triggered by one component (e.g., GlobalPackagesSection)
- **THEN** other components using `useInstalledPackages` (e.g., PackageBrowser) also update
