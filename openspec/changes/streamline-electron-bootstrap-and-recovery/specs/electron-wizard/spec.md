## ADDED Requirements

### Requirement: Wizard first-run scope
The Electron first-run wizard SHALL present exactly four steps in order: welcome, package selection, install progress, and completion. The wizard SHALL NOT contain mode-selection, bridge-install, API-key, or recommended-extensions-as-separate-step screens.

#### Scenario: Fresh install, empty managed dir
- **WHEN** Electron launches with `~/.pi-dashboard/node_modules/` empty
- **THEN** the wizard SHALL open at step-welcome
- **AND** the user SHALL be able to advance through welcome → select-packages → progress → done with no question about mode, bridge-install, or API keys

#### Scenario: Wizard reopened from Doctor
- **WHEN** the user triggers wizard via Doctor's "Run setup" action
- **THEN** the same four-step flow SHALL be shown
- **AND** no mode/bridge/auth steps SHALL appear regardless of detection state

### Requirement: Unified package selector
The wizard's package-selection step SHALL show a single screen with two grouped sections: "Required" (always-installed packages where `required: true`) and "Bundled extensions" (toggleable packages where `required: false`). Required packages SHALL be rendered with disabled checkboxes and an "[offline cache]" source label. Bundled extensions SHALL be rendered with toggleable checkboxes pre-checked when their `defaultOff` flag is absent or false, unchecked when `defaultOff: true`.

#### Scenario: Required packages cannot be unchecked
- **WHEN** the user views step-select-packages
- **THEN** every package with `required: true` SHALL render with a checked, disabled checkbox
- **AND** the user SHALL NOT be able to deselect any required package

#### Scenario: Bundled extension defaults respected
- **WHEN** the catalog contains an extension entry without `defaultOff` set (i.e., recommended-on)
- **THEN** its checkbox SHALL render checked by default
- **AND** an entry with `defaultOff: true` SHALL render unchecked
- **AND** the user SHALL be able to toggle either before clicking install

#### Scenario: npm-registry tier not shown
- **WHEN** the user views step-select-packages
- **THEN** no "From dashboard registry" or similar online-discovery section SHALL appear
- **AND** the catalog source SHALL be limited to offline-cache and bundled-git entries

### Requirement: Install button semantics
The package-selection step SHALL offer two action buttons: "Install defaults" (installs required + all bundled extensions in their default-on state) and "Install selected" (installs required + currently-checked bundled extensions). Both buttons SHALL transition to step-progress on click.

#### Scenario: Install defaults with no user interaction
- **WHEN** the user clicks "Install defaults" without toggling any checkbox
- **THEN** the effective install set SHALL equal the union of required packages and bundled extensions where `defaultOff` is absent or false

#### Scenario: Install selected with custom toggles
- **WHEN** the user unchecks `@example/experimental-skill` and clicks "Install selected"
- **THEN** the effective install set SHALL exclude `@example/experimental-skill`
- **AND** the user's toggle state SHALL be persisted to `installable.json` for future bootstrap reconciliation

### Requirement: Done step deep-links to settings
The wizard's completion step SHALL include a "Configure API keys" link that deep-links the dashboard to Settings → Provider Auth on launch, and a "Launch dashboard" primary action that closes the wizard and brings the main window into view.

#### Scenario: Deep-link from done step
- **WHEN** the user clicks "Configure API keys" on step-done
- **THEN** the wizard SHALL close
- **AND** the main dashboard window SHALL load `/settings?tab=provider-auth`

#### Scenario: Standard launch from done step
- **WHEN** the user clicks "Launch dashboard" on step-done
- **THEN** the wizard SHALL close
- **AND** the main dashboard window SHALL load the configured server URL at its root

### Requirement: Wizard trigger condition
The wizard SHALL open on app launch if and only if `~/.pi-dashboard/node_modules/` contains zero whitelisted-package directories AND the bootstrap preflight reports a populated-vs-empty result of empty. The wizard SHALL NOT open based on the presence or absence of `mode.json`.

#### Scenario: Existing managed install, no wizard
- **WHEN** Electron launches with `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/` present
- **THEN** the wizard SHALL NOT open
- **AND** the preflight reconciliation flow SHALL run instead

#### Scenario: Legacy mode.json present, no wizard
- **WHEN** Electron launches with a legacy `mode.json` file present AND managed dir populated
- **THEN** the wizard SHALL NOT open
- **AND** the legacy `mode.json` SHALL be deleted as a one-shot cleanup with a log entry
