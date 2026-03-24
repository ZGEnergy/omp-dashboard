## ADDED Requirements

### Requirement: Accordion session card expansion
The selected session card SHALL expand to show additional detail sections. Non-selected cards SHALL remain compact.

#### Scenario: Card expands on selection
- **WHEN** a session card is selected
- **THEN** it expands with a smooth animation to show the OpenSpec section (if available)

#### Scenario: Card collapses on deselection
- **WHEN** a different session card is selected
- **THEN** the previously selected card collapses to compact view

### Requirement: OpenSpec section displays change list
The expanded session card SHALL show an OpenSpec section that is **collapsed by default**. When collapsed, only a header line with a chevron (`▶`), "OpenSpec" label, and refresh button is visible. Clicking the header toggles expansion. Changes are shown in a flat list without "In Progress" or "Completed" section headers.

#### Scenario: Collapsed by default
- **WHEN** a session card is selected and has openspec initialized
- **THEN** the OpenSpec section SHALL render collapsed, showing only `▶ OpenSpec 🔄`

#### Scenario: Expand on click
- **WHEN** the user clicks the OpenSpec header
- **THEN** the section SHALL expand to show all changes and the "+ New Change" button, with the chevron changing to `▼`

#### Scenario: Collapse on click
- **WHEN** the user clicks the expanded OpenSpec header
- **THEN** the section SHALL collapse back to the header line only

#### Scenario: No section headers
- **WHEN** the OpenSpec section is expanded
- **THEN** changes SHALL be listed in a flat list (in-progress first, then completed) without "In Progress" or "Completed" group headers

#### Scenario: No openspec initialized
- **WHEN** the session's project does not have openspec initialized
- **THEN** the OpenSpec section is not shown

#### Scenario: Empty changes
- **WHEN** openspec is initialized but no changes exist
- **THEN** the collapsed header is shown; when expanded, only the "+ New Change" button is visible

### Requirement: OpenSpec action buttons
Each change card SHALL display action buttons appropriate to its status.

#### Scenario: In-progress change actions
- **WHEN** a change has status "no-tasks" or "in-progress"
- **THEN** the buttons [Explore], [Continue], and [FF] are shown

#### Scenario: Completed change actions
- **WHEN** a change has status "complete"
- **THEN** the buttons [Explore], [Apply], and [Archive] are shown

#### Scenario: Action sends command to session
- **WHEN** user clicks an action button (e.g., Continue for "theme-system")
- **THEN** a `send_prompt` is sent to the session with text `/opsx:continue theme-system`

### Requirement: New Change button
The OpenSpec section SHALL include a "+ New Change" button.

#### Scenario: New change action
- **WHEN** user clicks "+ New Change"
- **THEN** a `send_prompt` is sent to the session with text `/opsx:new`

### Requirement: Artifact letter indicators
Each change SHALL display artifact status as first-letter labels (e.g., P D S T) colored by readiness, replacing the previous colored dots.

The letter mapping SHALL be:
- `proposal` → **P**
- `design` → **D**
- `specs` → **S**
- `tasks` → **T**
- Any other artifact → first letter of its ID, uppercased

The color mapping SHALL be:
- `done` → green (`text-green-500`)
- `ready` → yellow (`text-yellow-500`)
- `blocked` → dim/muted (`text-[var(--text-muted)]`)

Letters SHALL be rendered in 10px bold monospace for alignment.

#### Scenario: All artifacts shown as letters
- **WHEN** a change has artifacts `[proposal: done, design: ready, specs: blocked, tasks: blocked]`
- **THEN** the display SHALL show `P D S T` where P is green, D is yellow, S and T are dim

#### Scenario: All artifacts done
- **WHEN** all artifacts have status `done`
- **THEN** all letters SHALL be green

#### Scenario: Letter tooltip
- **WHEN** the user hovers over an artifact letter
- **THEN** a tooltip SHALL show the full artifact name and status (e.g., "proposal: done")

### Requirement: Slim change card layout
Each change SHALL be displayed in a compact layout: one line for name, artifact letters, and task count; a second line for action buttons.

#### Scenario: Change card single line
- **WHEN** a change card is rendered
- **THEN** the first line SHALL show: change name (truncated), artifact letters, and task count (e.g., `2/5 tasks`) aligned to the end

#### Scenario: Task count inline
- **WHEN** a change has tasks
- **THEN** the task count SHALL appear on the same line as the name and letters, not on a separate line

#### Scenario: No tasks
- **WHEN** a change has `totalTasks: 0`
- **THEN** no task count SHALL be displayed on that line

#### Scenario: Action buttons on second line
- **WHEN** a change card is rendered
- **THEN** action buttons SHALL appear on a second line below the name/letters/tasks line

### Requirement: Refresh button always visible
The refresh button SHALL be visible in both collapsed and expanded states, on the header line.

#### Scenario: Refresh in collapsed state
- **WHEN** the OpenSpec section is collapsed
- **THEN** the refresh button SHALL be visible on the header line and clickable

#### Scenario: Refresh in expanded state
- **WHEN** the OpenSpec section is expanded
- **THEN** the refresh button SHALL remain on the header line

#### Scenario: Manual refresh
- **WHEN** user clicks the refresh button
- **THEN** an `openspec_refresh` message is sent and the data updates
