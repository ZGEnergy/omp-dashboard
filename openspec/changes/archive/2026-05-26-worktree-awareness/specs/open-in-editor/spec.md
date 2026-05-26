## MODIFIED Requirements

### Requirement: Open editor endpoint
The server SHALL expose `POST /api/open-editor` accepting `{ path: string, editor: string }`. It SHALL validate that `path` matches a known session `cwd` and `editor` is a recognized editor ID, then spawn the editor CLI as a detached process.

Each editor entry in the registry MAY have an optional `openArgs` array of extra CLI arguments. These arguments SHALL be prepended before the target path when spawning the editor. For Zed, `openArgs` SHALL be `["-n"]` to create a new workspace window when the directory is not already open.

#### Scenario: Valid open request
- **WHEN** a POST request is made with a valid session cwd and recognized editor ID
- **THEN** the server SHALL spawn the editor CLI with any `openArgs` followed by the path as argument and respond with `{ success: true }`

#### Scenario: Zed open for new directory
- **WHEN** Zed is requested to open a directory that is not already open in any Zed window
- **THEN** the server SHALL spawn `zed -n <path>`, creating a new Zed workspace window

#### Scenario: Zed open for already-open directory
- **WHEN** Zed is requested to open a directory that is already open in a Zed window
- **THEN** the server SHALL spawn `zed -n <path>`, which focuses the existing window

#### Scenario: Unknown path
- **WHEN** a POST request is made with a path that does not match any active session's cwd
- **THEN** the server SHALL respond with `{ success: false, error: "unknown session path" }`

#### Scenario: Unknown editor
- **WHEN** a POST request is made with an editor ID not in the registry
- **THEN** the server SHALL respond with `{ success: false, error: "unknown editor" }`
