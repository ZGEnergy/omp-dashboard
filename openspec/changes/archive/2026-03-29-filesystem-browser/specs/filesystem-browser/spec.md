## ADDED Requirements

### Requirement: Directory browse API
The server SHALL expose `GET /api/browse?path=<dir>` (localhost-only) that returns directory entries for the given path. The response SHALL include `{ success: true, data: { entries: Array<{ name, path, isGit, isPi }>, parent: string | null, current: string } }`. Only directories SHALL be listed (no files). Hidden directories (names starting with `.`) SHALL be excluded. Entries SHALL be sorted alphabetically. If `path` is omitted, it SHALL default to the user's home directory. The entry limit SHALL be 200.

#### Scenario: Browse valid directory
- **WHEN** a GET request is made to `/api/browse?path=/home/user/projects`
- **THEN** the server SHALL return a list of subdirectories with `isGit` and `isPi` flags indicating presence of `.git` and `.pi` directories

#### Scenario: Browse home directory (default)
- **WHEN** a GET request is made to `/api/browse` without a path parameter
- **THEN** the server SHALL return entries for the user's home directory (`os.homedir()`)

#### Scenario: Browse non-existent directory
- **WHEN** a GET request is made with a path that does not exist
- **THEN** the server SHALL return `{ success: false, error: "directory not found" }`

#### Scenario: Parent path included
- **WHEN** a directory listing is returned for `/home/user/projects`
- **THEN** the `parent` field SHALL be `/home/user`

#### Scenario: Root directory has no parent
- **WHEN** a directory listing is returned for `/`
- **THEN** the `parent` field SHALL be `null`

#### Scenario: Remote access blocked
- **WHEN** a GET request originates from a non-loopback address
- **THEN** the server SHALL return `{ success: false, error: "localhost only" }`

#### Scenario: Hidden directories excluded
- **WHEN** a directory contains subdirectories like `.config`, `.cache`, `projects`
- **THEN** only `projects` SHALL appear in the entries (hidden dirs excluded)

#### Scenario: Entry limit
- **WHEN** a directory contains more than 200 subdirectories
- **THEN** only the first 200 (alphabetically sorted) SHALL be returned

### Requirement: PathPicker component
The web client SHALL provide a reusable `PathPicker` component combining a text input with a fixed-height scrollable directory list for keyboard-first filesystem navigation.

The component SHALL display:
- Text input (always focused) showing the current path with cursor
- Fixed-height directory list (configurable rows, default 8) below the input
- `..` entry at the top of the list for parent navigation (except at root)
- Visual indicators for git repos (`isGit`) and pi projects (`isPi`)
- Highlight on the currently selected list entry

#### Scenario: Open PathPicker
- **WHEN** PathPicker mounts with `initialPath="/Users/robson/"`
- **THEN** the input SHALL show `/Users/robson/` and the list SHALL show subdirectories of that path

#### Scenario: Open PathPicker without initialPath
- **WHEN** PathPicker mounts without `initialPath`
- **THEN** it SHALL default to the user's home directory

#### Scenario: Type to filter
- **WHEN** the user types characters after the last `/` in the input
- **THEN** the list SHALL filter entries client-side to those matching the typed partial (case-insensitive prefix match)
- **AND** the highlight SHALL reset to the first matching entry

#### Scenario: Arrow key navigation
- **WHEN** the user presses ↓ or ↑
- **THEN** the highlight SHALL move through the filtered list entries
- **AND** focus SHALL remain in the text input

#### Scenario: Tab descends into directory
- **WHEN** the user presses Tab with a highlighted entry
- **THEN** the input SHALL become `parentPath + highlightedEntry + /`
- **AND** the list SHALL fetch and show the contents of that directory

#### Scenario: Single match auto-select
- **WHEN** only one entry matches the typed partial
- **THEN** Tab SHALL complete that entry without requiring arrow key selection first

#### Scenario: Enter confirms path
- **WHEN** the user presses Enter
- **THEN** `onSelect` SHALL be called with the current input path

#### Scenario: Escape cancels
- **WHEN** the user presses Escape
- **THEN** `onCancel` SHALL be called

#### Scenario: Click entry descends
- **WHEN** the user clicks a directory entry in the list
- **THEN** the input SHALL become that entry's path + `/`
- **AND** the list SHALL fetch and show the contents of that directory

#### Scenario: Click `..` goes up
- **WHEN** the user clicks the `..` entry
- **THEN** the input SHALL navigate to the parent directory
- **AND** the list SHALL show the parent's contents

#### Scenario: Backspace past slash
- **WHEN** the user backspaces past a `/` separator
- **THEN** the resolved parent SHALL change to the grandparent directory
- **AND** the list SHALL fetch the grandparent's contents
- **AND** the remaining text after the new last `/` SHALL filter the list

#### Scenario: Paste full path
- **WHEN** the user pastes a full path like `/Users/robson/Project/pi-agent-dashboard`
- **THEN** PathPicker SHALL resolve the deepest valid directory
- **AND** display its contents in the list

#### Scenario: Empty directory
- **WHEN** the resolved directory has no subdirectories
- **THEN** the list SHALL show only `..` and a "No subdirectories" hint

#### Scenario: No filter matches
- **WHEN** the typed partial matches no entries
- **THEN** the list SHALL show `..` and a "No matches" hint

#### Scenario: Loading state
- **WHEN** the PathPicker is fetching directory contents from the API
- **THEN** a loading indicator SHALL be shown in the list area

#### Scenario: Git repo indicator
- **WHEN** a directory entry has `isGit: true`
- **THEN** it SHALL show a visual git indicator

#### Scenario: Pi project indicator
- **WHEN** a directory entry has `isPi: true`
- **THEN** it SHALL show a visual pi indicator
