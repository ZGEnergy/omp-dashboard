## MODIFIED Requirements

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
