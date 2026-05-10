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
