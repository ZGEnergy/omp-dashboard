# editor-file-search — delta

## ADDED Requirements

### Requirement: Editor pane SHALL host a dual-mode search panel

The editor pane SHALL provide a toggleable search panel with two modes: **Filenames**
(search file paths under the session `cwd`) and **Contents** (grep across file bodies).
The active mode SHALL be switchable in the panel. Each mode SHALL support a type-ahead
query with a **substring** matcher and an optional **regexp** matcher toggled in the
panel.

Both modes SHALL require a minimum query length (default 3 characters) before issuing a
search, and SHALL debounce input. Below the minimum, the panel SHALL show a "type ≥ N
chars" hint and issue no request.

#### Scenario: Filename mode ranks path matches
- **GIVEN** the search panel is in Filenames mode
- **WHEN** the user types `edit` (≥ 3 chars)
- **THEN** the panel lists files whose path matches, highest-ranked first
- **AND** each result shows its path relative to the session `cwd`

#### Scenario: Content mode greps file bodies
- **GIVEN** the search panel is in Contents mode
- **WHEN** the user types `MAX_VISITS`
- **THEN** the panel lists content matches with `path`, line number, and a snippet
- **AND** the matched substring is highlighted in the snippet

#### Scenario: Regexp toggle switches the matcher
- **GIVEN** the regexp toggle is on in Contents mode
- **WHEN** the user types `MAX_[A-Z]+`
- **THEN** matches are computed by regular expression, not literal substring

#### Scenario: Below minimum length issues no search
- **WHEN** the user types `ma` (2 chars) in either mode
- **THEN** no search request is issued
- **AND** the panel shows a "type ≥ 3 chars" hint

### Requirement: Search results SHALL be keyboard navigable and open on select

The result list SHALL be navigable with `↑`/`↓`, open the selected result with `Enter`,
and close the panel with `Escape`. Selecting a result SHALL open the file in the editor
pane (auto-opening the split if closed), activate its tab, and — for content matches —
scroll to the matched line.

#### Scenario: Enter opens the highlighted result
- **GIVEN** the result list has three entries with the first highlighted
- **WHEN** the user presses `↓` then `Enter`
- **THEN** the second result's file opens as the active tab in the pane

#### Scenario: Content match scrolls to the line
- **WHEN** the user opens a Contents-mode result at line 80
- **THEN** the file opens and the viewer scrolls so line 80 is visible

#### Scenario: Escape closes the panel
- **WHEN** the search panel is open and the user presses `Escape`
- **THEN** the panel closes and focus returns to the active viewer

### Requirement: Server SHALL provide a content-search endpoint

The server SHALL expose `GET /api/grep?cwd=<cwd>&q=<query>&regex=<bool>` returning
ranked content matches `{ path, line, col, snippet }[]`. The endpoint SHALL prefer
`ripgrep` (`rg`) when available (which honours `.gitignore`) and SHALL fall back to a
bounded in-process scan when `rg` is absent. The scan SHALL cap scanned files, bytes
per file, and total matches to bound response size.

The endpoint SHALL apply the same security gates as `/api/file`: `cwd` SHALL match a
known session path; resolved match paths SHALL remain within `cwd`; traversal attempts
SHALL be rejected.

#### Scenario: ripgrep-backed search returns matches
- **GIVEN** `ripgrep` is installed
- **WHEN** the client issues `GET /api/grep?cwd=/Users/u/proj&q=MAX_VISITS`
- **THEN** the response lists matches with `path`, `line`, and `snippet`
- **AND** `.gitignore`-ignored paths are excluded

#### Scenario: Fallback scan works without ripgrep
- **GIVEN** `ripgrep` is not on `PATH`
- **WHEN** the client issues a content search
- **THEN** the server performs a bounded in-process scan and returns matches
- **AND** the number of matches does not exceed the configured cap

#### Scenario: Path traversal rejected
- **WHEN** the client issues `GET /api/grep?cwd=/Users/u/proj&q=x` and a match would
  resolve outside `cwd`
- **THEN** that match SHALL be excluded and no path outside `cwd` SHALL be returned

#### Scenario: cwd not a known session is rejected
- **WHEN** the client issues `GET /api/grep` with a `cwd` that matches no session
- **THEN** the server responds with an error and performs no scan
