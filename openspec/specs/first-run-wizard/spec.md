## ADDED Requirements

### Requirement: API key configuration step
The wizard SHALL prompt for an LLM API key and write it to pi's settings file.

#### Scenario: User enters API key
- **WHEN** the user enters an API key and clicks "Save"
- **THEN** the wizard SHALL write the key to `~/.pi/agent/settings.json` in the appropriate provider field

#### Scenario: User skips API key
- **WHEN** the user clicks "Skip" on the API key step
- **THEN** the wizard SHALL proceed (pi sessions will fail until configured, but the dashboard itself works)

#### Scenario: API key already configured
- **WHEN** `~/.pi/agent/settings.json` already contains an API key
- **THEN** the API key step SHALL be pre-filled and show "Already configured"

### Requirement: Bundled status indication
The first-run wizard SHALL visually distinguish recommended extensions that were activated from the bundled payload from those installed dynamically from npm/git.

#### Scenario: Bundled-installed entry
- **WHEN** a recommended extension's install progress reports `output: "Already installed (bundled)"` or was processed by `installBundledExtensions()`
- **THEN** the wizard row SHALL render a "Bundled ✓" badge next to the step name

#### Scenario: System-installed entry
- **WHEN** an entry was skipped because it is already present on the user's system (not from bundle)
- **THEN** the wizard row SHALL render an "Installed" badge, distinct from the "Bundled ✓" badge

#### Scenario: Dynamically-installed entry
- **WHEN** an entry is installed via `installRecommendedExtensions()` during the wizard
- **THEN** the wizard row SHALL show normal running/done progress with no bundled badge

### Requirement: Doctor escape hatch from wizard
The first-run wizard SHALL surface a link or button labelled "Run Doctor" alongside the existing Skip affordance so users who hit a wizard error can pivot to the diagnostic surface without restarting the app.

#### Scenario: Doctor link visible on wizard
- **WHEN** the wizard is open on any step
- **THEN** a "Run Doctor" affordance SHALL be visible in the wizard footer area near the Skip / Cancel control

#### Scenario: Doctor link opens the Doctor window
- **WHEN** the user clicks the "Run Doctor" affordance
- **THEN** the Doctor BrowserWindow SHALL open (or focus if already open)
- **AND** the wizard window SHALL remain open in the background so the user can return to it

### Requirement: Splash and wizard windows are mutually exclusive on screen
The Electron main process SHALL NOT display the splash window and the first-run wizard window simultaneously. When transitioning into the `wizard-welcome` state, the splash window SHALL be closed before the wizard window is opened. When the wizard closes (user clicks `[Launch dashboard]` or dismisses), the splash MAY re-open to surface subsequent status updates (`Launching dashboard server…`, `Opening dashboard…`).

Rationale: the splash window is configured `alwaysOnTop: true` (to remain visible during the splash-only phases of `checking-server-health` and `loading-page-error`). If left open while the wizard is showing, the splash visually occludes the wizard on Windows — the user cannot see or interact with the `[Launch dashboard]` CTA, and the entire startup machine stalls awaiting `openWizardWindow`'s `'closed'` event.

#### Scenario: Splash closes before wizard opens
- **WHEN** the Electron main process transitions from `checking-server-health` to `wizard-welcome` (first launch, no `~/.pi/dashboard/first-run-done` marker)
- **THEN** the splash window SHALL be closed (via `closeSplash()`) before `openWizardWindow()` is called

#### Scenario: Splash re-opens after wizard closes
- **WHEN** the user clicks `[Launch dashboard]` in the wizard AND the wizard window closes AND the main process needs to surface `Launching dashboard server…` status
- **THEN** the splash window SHALL be re-shown (via `showSplash()`) before the next `updateSplashStatus()` call
- **AND** the re-opened splash SHALL display the new status text

#### Scenario: Only one window visible on Windows during wizard-welcome
- **WHEN** the user observes the screen during the `wizard-welcome` state on Windows
- **THEN** exactly ONE window SHALL be visible — the wizard window with the `[Launch dashboard]` CTA
- **AND** the splash window SHALL NOT be present

### Requirement: Wizard window grabs focus on ready-to-show
The first-run wizard window SHALL be constructed with `show: false` and SHALL listen for the `'ready-to-show'` event to call `.show()` and `.focus()`. This is the canonical Electron no-flash pattern and SHALL also guarantee that the wizard claims focus on Windows even if a sibling window (e.g. a delayed-closing splash) would otherwise capture it.

#### Scenario: No unstyled flash
- **WHEN** the wizard window opens on a fresh launch
- **THEN** the user SHALL NOT see an unstyled blank window for any visible duration before the styled wizard content paints

#### Scenario: Wizard takes focus
- **WHEN** the wizard window's `'ready-to-show'` event fires
- **THEN** the wizard window SHALL receive keyboard focus (`focus()` called)
- **AND** SHALL appear at the top of the window z-order

#### Scenario: Cross-platform behaviour
- **WHEN** the wizard opens on macOS or Linux
- **THEN** the show + focus behaviour SHALL be identical to Windows
- **AND** SHALL NOT regress the existing wizard launch on those platforms
