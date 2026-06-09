## ADDED Requirements

### Requirement: Clickable artifact letters
Each artifact status letter (P, S, D, T) in the change card SHALL be a clickable button that opens the corresponding artifact's markdown content in the preview view.

#### Scenario: Click artifact letter
- **WHEN** the user clicks the "P" letter on change "my-change"
- **THEN** the markdown preview SHALL open showing the content of `openspec/changes/my-change/proposal.md`
- **AND** the tab bar SHALL show all available artifacts with "P" as the active tab

#### Scenario: Click different letter
- **WHEN** the user clicks the "D" letter on change "my-change"
- **THEN** the markdown preview SHALL open with the design artifact active

#### Scenario: Letter cursor hint
- **WHEN** the user hovers over an artifact letter
- **THEN** the cursor SHALL change to pointer to indicate clickability

### Requirement: Read action button
Each change card SHALL display a "Read" action button that opens the first available artifact in the preview view.

#### Scenario: Read button opens first artifact
- **WHEN** the user clicks "Read" on a change with artifacts [proposal, design, specs, tasks]
- **THEN** the markdown preview SHALL open showing the first artifact (proposal) with all artifacts in the tab bar

#### Scenario: Read button with no artifacts
- **WHEN** a change has no artifacts
- **THEN** the "Read" button SHALL NOT be displayed

### Requirement: Tab navigation between artifacts
When the preview is open for an OpenSpec change, the tab bar SHALL show all artifacts for that change. The active tab SHALL be derived from the URL's `:artifactId` segment, not from internal component state. Clicking a tab SHALL navigate to that artifact's preview URL (push history); the active tab and content then follow the URL.

#### Scenario: Switch tab updates URL
- **WHEN** the preview is open on the proposal tab and the user clicks the "D" tab
- **THEN** the browser URL SHALL change to `/folder/:encodedCwd/openspec/:changeName/design` via push history
- **AND** the content SHALL update to show the design artifact
- **AND** the "D" tab SHALL be marked active

#### Scenario: URL segment drives active tab on mounted preview
- **WHEN** the preview is mounted showing the proposal artifact for change "my-change"
- **AND** the route's `:artifactId` segment changes to `design` (e.g. the user clicks the "D" letter for the same change in the sidebar)
- **THEN** the active tab SHALL update to design and the content SHALL show the design artifact, without remounting the preview

#### Scenario: Refresh preserves active artifact
- **WHEN** the user has switched to the design tab and reloads the page
- **THEN** the preview SHALL reopen on the design artifact (the URL's `:artifactId` is `design`)

#### Scenario: Shared link opens the correct artifact
- **WHEN** a user copies the current URL while viewing the design tab and another user opens it
- **THEN** the preview SHALL open showing the design artifact

#### Scenario: Browser Back steps through artifacts
- **WHEN** the user views proposal, then clicks design, then clicks specs, then presses browser Back
- **THEN** the URL SHALL return to the design artifact and the design content SHALL be shown

#### Scenario: Tab colors match status
- **WHEN** the tab bar renders artifact tabs
- **THEN** each tab label SHALL use the same status color as the sidebar letters (green for done, yellow for ready, dim for blocked)

### Requirement: Specs concatenation
When the "S" (specs) tab is selected, the preview SHALL fetch all spec files under the change's `specs/` directory and concatenate them into a single view with section headers.

#### Scenario: Multiple specs concatenated
- **WHEN** the "S" tab is selected for a change with specs `["auth", "data-export"]`
- **THEN** the preview SHALL show both specs concatenated with `# auth` and `# data-export` headers separated by horizontal rules

#### Scenario: Single spec
- **WHEN** the "S" tab is selected for a change with one spec `["auth"]`
- **THEN** the preview SHALL show the spec content with a `# auth` header

#### Scenario: No specs directory
- **WHEN** the "S" tab is selected but the specs directory does not exist
- **THEN** the preview SHALL show an appropriate empty/error message

### Requirement: Artifact path mapping
The OpenSpec reader SHALL map artifact IDs to file paths relative to the change directory, supporting both active and archived changes.

#### Scenario: Standard artifacts
- **WHEN** the artifact ID is "proposal", "design", or "tasks" and the change is active
- **THEN** the file path SHALL be `openspec/changes/<changeName>/<artifactId>.md`

#### Scenario: Specs artifact
- **WHEN** the artifact ID is "specs" and the change is active
- **THEN** the reader SHALL list `openspec/changes/<changeName>/specs/` directory entries and fetch `<entry>/spec.md` for each

#### Scenario: Standard artifacts from archive
- **WHEN** the artifact ID is "proposal", "design", or "tasks" and the change is archived
- **THEN** the file path SHALL be `openspec/changes/archive/<changeName>/<artifactId>.md`

#### Scenario: Specs artifact from archive
- **WHEN** the artifact ID is "specs" and the change is archived
- **THEN** the reader SHALL list `openspec/changes/archive/<changeName>/specs/` directory entries and fetch `<entry>/spec.md` for each
