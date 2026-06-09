## MODIFIED Requirements

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
