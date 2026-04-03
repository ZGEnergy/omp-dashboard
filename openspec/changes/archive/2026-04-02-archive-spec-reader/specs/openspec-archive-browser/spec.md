## ADDED Requirements

### Requirement: Archive listing endpoint
The server SHALL expose `GET /api/openspec-archive?cwd=<path>` that returns all archived changes for the given directory.

#### Scenario: Successful listing
- **WHEN** a GET request is made to `/api/openspec-archive?cwd=/project/foo` and the directory has archived changes
- **THEN** the response SHALL be `{ success: true, data: [...] }` where each entry contains `name` (string), `date` (string, YYYY-MM-DD), and `artifacts` (array of `{ id, status }`)

#### Scenario: No archive directory
- **WHEN** a GET request is made and `openspec/changes/archive/` does not exist in the cwd
- **THEN** the response SHALL be `{ success: true, data: [] }`

#### Scenario: Missing cwd parameter
- **WHEN** a GET request is made without a `cwd` query parameter
- **THEN** the response SHALL return 400 with `{ success: false, error: "Missing cwd" }`

### Requirement: Archive entry artifact detection
Each archive entry SHALL include detected artifacts based on file existence in the archive directory.

#### Scenario: Entry with all artifacts
- **WHEN** archive entry `2026-03-27-openspec-artifact-reader/` contains `proposal.md`, `design.md`, `tasks.md`, and `specs/` directory
- **THEN** the artifacts array SHALL include entries for proposal, design, specs, and tasks, all with status "done"

#### Scenario: Entry with partial artifacts
- **WHEN** archive entry `2026-03-22-auto-shutdown/` contains only `proposal.md` and `tasks.md`
- **THEN** the artifacts array SHALL include only proposal and tasks

### Requirement: Archive browser view
The dashboard SHALL provide an `ArchiveBrowserView` content-area component that displays archived changes in a searchable, date-grouped list.

#### Scenario: Initial render
- **WHEN** the archive browser opens for cwd `/project/foo`
- **THEN** it SHALL fetch the archive listing and display entries grouped by date, newest-first, with a search input at the top

#### Scenario: Search filters by name
- **WHEN** the user types "auth" in the search input
- **THEN** only entries whose slug contains "auth" (case-insensitive) SHALL be shown

#### Scenario: Empty search shows all
- **WHEN** the search input is empty
- **THEN** all archived entries SHALL be displayed

#### Scenario: No results
- **WHEN** the user searches for a term that matches no entries
- **THEN** a "No matching entries" message SHALL be displayed

#### Scenario: Date group headers
- **WHEN** entries are displayed
- **THEN** they SHALL be grouped under date headers (e.g., "2026-04-02", "2026-04-01") sorted newest-first

### Requirement: Archive entry artifact navigation
Each archive entry row SHALL display artifact letter buttons (P D S T) that open the artifact reader for that archived change.

#### Scenario: Click artifact letter on archive entry
- **WHEN** the user clicks the "P" button on archived entry `2026-03-27-openspec-artifact-reader`
- **THEN** the artifact reader SHALL open showing the proposal content from `openspec/changes/archive/2026-03-27-openspec-artifact-reader/proposal.md`

#### Scenario: Artifact letters match available artifacts
- **WHEN** an archive entry has only proposal and tasks artifacts
- **THEN** only "P" and "T" letter buttons SHALL be displayed

### Requirement: Two-level navigation
The archive browser SHALL use two-level navigation: the archive list is the first level, and the artifact reader is the second level. Back from the reader returns to the archive list, preserving scroll position and search filter. Back from the archive list returns to the session/default view.

#### Scenario: Back from artifact reader returns to archive list
- **WHEN** the user opens an artifact from the archive browser and clicks Back
- **THEN** the content area SHALL return to the archive browser (not the session list)
- **AND** the search filter and scroll position SHALL be preserved

#### Scenario: Back from archive browser returns to session list
- **WHEN** the user clicks the back button in the archive browser (not inside an artifact reader)
- **THEN** the content area SHALL return to the session/default view (clear `archiveBrowserCwd` state)
