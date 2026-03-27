## MODIFIED Requirements

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

Letters SHALL be rendered in 10px bold monospace for alignment. Each letter SHALL be a clickable button that triggers the `onReadArtifact` callback with the change name and artifact ID. On hover, the cursor SHALL change to pointer.

#### Scenario: All artifacts shown as clickable letters
- **WHEN** a change has artifacts `[proposal: done, design: ready, specs: blocked, tasks: blocked]`
- **THEN** the display SHALL show `P D S T` where P is green, D is yellow, S and T are dim
- **AND** each letter SHALL be a clickable button

#### Scenario: All artifacts done
- **WHEN** all artifacts have status `done`
- **THEN** all letters SHALL be green and clickable

#### Scenario: Letter tooltip
- **WHEN** the user hovers over an artifact letter
- **THEN** a tooltip SHALL show the full artifact name and status (e.g., "proposal: done")

#### Scenario: Letter click opens preview
- **WHEN** the user clicks an artifact letter
- **THEN** `onReadArtifact` SHALL be called with the change name and artifact ID

### Requirement: OpenSpec action buttons
Each change card SHALL display action buttons appropriate to its status. A "Read" button SHALL always be shown when the change has at least one artifact.

#### Scenario: In-progress change actions
- **WHEN** a change has status "no-tasks" or "in-progress" and has artifacts
- **THEN** the buttons [Read], [Explore], [Continue], and [FF] are shown

#### Scenario: Completed change actions
- **WHEN** a change has status "complete" and has artifacts
- **THEN** the buttons [Read], [Explore], [Apply], and [Archive] are shown

#### Scenario: No artifacts
- **WHEN** a change has no artifacts
- **THEN** the "Read" button SHALL NOT be shown

#### Scenario: Read button opens first artifact
- **WHEN** the user clicks "Read"
- **THEN** `onReadArtifact` SHALL be called with the change name and the first artifact's ID

#### Scenario: Action sends command to session
- **WHEN** user clicks an action button (e.g., Continue for "theme-system")
- **THEN** a `send_prompt` is sent to the session with text `/opsx:continue theme-system`
