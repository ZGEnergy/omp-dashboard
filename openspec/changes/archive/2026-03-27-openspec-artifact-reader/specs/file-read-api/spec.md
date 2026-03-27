## ADDED Requirements

### Requirement: File read endpoint
The server SHALL expose `GET /api/file` that reads a file or lists a directory from a session's working directory. The endpoint accepts query parameters `cwd` (absolute path) and `path` (relative path within cwd).

#### Scenario: Read a file
- **WHEN** a request is made to `GET /api/file?cwd=/path/to/project&path=openspec/changes/foo/proposal.md`
- **AND** the file exists
- **THEN** the response SHALL be `{ success: true, data: { type: "file", content: "<file contents>" } }`

#### Scenario: List a directory
- **WHEN** a request is made to `GET /api/file?cwd=/path/to/project&path=openspec/changes/foo/specs`
- **AND** the path is a directory
- **THEN** the response SHALL be `{ success: true, data: { type: "directory", entries: ["session-grouping", "pinned-directories"] } }`
- **AND** entries SHALL be sorted alphabetically

#### Scenario: File not found
- **WHEN** the requested path does not exist
- **THEN** the response SHALL be `{ success: false, error: "not found" }` with HTTP 404

#### Scenario: Missing parameters
- **WHEN** `cwd` or `path` query parameters are missing
- **THEN** the response SHALL be `{ success: false, error: "cwd and path parameters required" }` with HTTP 400

### Requirement: File endpoint security guards
The file read endpoint SHALL enforce three security guards to prevent unauthorized file access.

#### Scenario: Localhost only
- **WHEN** a request originates from a non-loopback address
- **THEN** the request SHALL be rejected with HTTP 403

#### Scenario: Known session cwd
- **WHEN** the `cwd` parameter does not match any active or ended session's working directory
- **THEN** the response SHALL be `{ success: false, error: "unknown session path" }` with HTTP 403

#### Scenario: Path containment
- **WHEN** the resolved absolute path of `cwd + path` is outside the `cwd` directory (e.g., path traversal via `../../etc/passwd`)
- **THEN** the response SHALL be `{ success: false, error: "path outside working directory" }` with HTTP 403

#### Scenario: Valid request passes all guards
- **WHEN** the request is from localhost, the cwd matches a known session, and the resolved path is inside the cwd
- **THEN** the file content or directory listing SHALL be returned
