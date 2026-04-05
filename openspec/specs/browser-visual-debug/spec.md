# browser-visual-debug

Skill providing browser-based visual debugging workflows — screenshot verification, interactive element inspection, responsive testing across viewports, console/network error hunting, and dashboard-specific recipes tied to component files.

## Requirements

### Requirement: pi-agent-browser package installation
The project SHALL include `pi-agent-browser` as a project-local pi package in `.pi/settings.json` so the `browser` tool is available to agents working in this repo.

#### Scenario: Package declared in settings
- **WHEN** an agent loads the project
- **THEN** `.pi/settings.json` SHALL contain `"npm:pi-agent-browser"` in its `packages` array

### Requirement: Skill SKILL.md with core workflows
The skill SHALL provide a `SKILL.md` at `.pi/skills/browser-visual-debug/SKILL.md` that documents prerequisites, quick reference, and four core workflows: visual verification, interactive debugging, responsive checks, and console error hunting.

#### Scenario: Prerequisites documented
- **WHEN** an agent reads the skill
- **THEN** SKILL.md SHALL state that `pi-agent-browser` package must be installed and a vision-capable model is required for screenshot analysis

#### Scenario: Quick reference
- **WHEN** an agent needs to quickly use the browser
- **THEN** SKILL.md SHALL provide a quick reference showing: detect dashboard URL via script, open page, wait for networkidle, take screenshot

#### Scenario: Visual verification workflow
- **WHEN** an agent has modified a UI component and wants to verify the rendered result
- **THEN** SKILL.md SHALL describe a workflow: open dashboard URL → wait networkidle → screenshot → reason about the visual output

#### Scenario: Interactive debugging workflow
- **WHEN** an agent needs to debug a click/interaction behavior
- **THEN** SKILL.md SHALL describe a workflow: open → snapshot -i → interact with @ref elements → screenshot after each mutation

#### Scenario: Console error hunting workflow
- **WHEN** an agent suspects JavaScript errors or failed network requests
- **THEN** SKILL.md SHALL describe a workflow: open → console → network → screenshot to correlate visible state with errors

### Requirement: Dashboard detection script
The skill SHALL provide a `scripts/detect-dashboard.sh` script that auto-detects the dashboard URL, running mode, and Vite dev server status.

#### Scenario: Dashboard running in production mode
- **WHEN** the dashboard server is running on the configured port
- **THEN** the script SHALL output the dashboard URL and mode (production)

#### Scenario: Dashboard running in dev mode with Vite
- **WHEN** the dashboard server is running in dev mode and Vite is running on port 5173
- **THEN** the script SHALL output the dashboard URL, mode (dev), and Vite URL

#### Scenario: Dashboard not running
- **WHEN** no dashboard server is detected
- **THEN** the script SHALL output a clear "not running" message

### Requirement: Dashboard-specific recipes reference
The skill SHALL provide a `references/dashboard-recipes.md` file with debugging recipes that map scenarios to browser commands and reference the relevant component source files.

#### Scenario: Recipe references component files
- **WHEN** an agent reads a recipe (e.g., "Verify session card rendering")
- **THEN** the recipe SHALL list the relevant component file paths (e.g., `src/client/components/SessionCard.tsx`)

#### Scenario: Recipe includes complete command sequence
- **WHEN** an agent follows a recipe
- **THEN** the recipe SHALL provide the full sequence of `browser` tool commands from open to close

### Requirement: Responsive testing reference
The skill SHALL provide a `references/responsive-testing.md` file with viewport presets and a workflow for testing across device sizes using `agent-browser set viewport`.

#### Scenario: Viewport presets defined
- **WHEN** an agent needs to test responsive layouts
- **THEN** the reference SHALL define named presets: mobile (375×667), tablet (768×1024), desktop (1280×720), wide (1920×1080)

#### Scenario: Runtime viewport switching
- **WHEN** an agent wants to test multiple viewports in one session
- **THEN** the reference SHALL describe using `browser set viewport W H` to switch without restarting the browser

#### Scenario: Dark mode testing
- **WHEN** an agent wants to verify dark/light theme rendering
- **THEN** the reference SHALL describe using `browser set media dark` and `browser set media light`

### Requirement: Commands cheatsheet reference
The skill SHALL provide a `references/commands-cheatsheet.md` file with a quick-reference table of the most useful `agent-browser` commands.

#### Scenario: Cheatsheet covers core commands
- **WHEN** an agent needs a command reminder
- **THEN** the cheatsheet SHALL include: open, snapshot, click, fill, type, press, screenshot, screenshot --annotate, set viewport, set media, console, network, eval, close
