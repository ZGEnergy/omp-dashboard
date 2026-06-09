## ADDED Requirements

### Requirement: Artifact tab reflected in URL segment
The `:artifactId` segment of `/folder/:encodedCwd/openspec/:changeName/:artifactId` SHALL stay in sync with the artifact tab visible in the OpenSpec preview. Switching tabs SHALL navigate via push history (mirroring "Session selection navigates via push"), so each artifact view is a discrete, shareable, refresh-safe history entry. The visible tab SHALL be derived from this segment, making the URL the single source of truth for which artifact within a change is shown.

#### Scenario: Tab switch pushes a new history entry
- **WHEN** the user is at `/folder/:cwd/openspec/my-change/proposal` and clicks the design tab
- **THEN** the URL SHALL change to `/folder/:cwd/openspec/my-change/design`
- **AND** a new browser history entry SHALL be created (push, not replace)

#### Scenario: Back walks artifact history
- **WHEN** the user navigates proposal → design → specs within one change and presses browser Back twice
- **THEN** the URL SHALL return first to the design artifact, then to the proposal artifact

#### Scenario: Tab switching never triggers the cold-load fallback
- **WHEN** the user switches artifact tabs any number of times and then presses the back button
- **THEN** `window.history.back()` SHALL be used (history length is greater than 1) and the `navigate("/")` cold-load fallback SHALL NOT fire
