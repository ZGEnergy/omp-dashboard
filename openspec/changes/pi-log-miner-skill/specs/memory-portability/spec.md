## ADDED Requirements

### Requirement: Markdown export at git-friendly path
The system SHALL write session summaries to `.pi/memories/session-summaries/<session-id>.md` within the project directory. This path is git-trackable for team sharing.

#### Scenario: Summary generated
- **WHEN** the pipeline completes analysis of a session
- **THEN** a markdown file is written at the expected path with the full categorized summary

#### Scenario: Directory creation
- **WHEN** the `.pi/memories/session-summaries/` directory does not exist
- **THEN** the system creates it recursively before writing the file

### Requirement: Honcho conclusions accessible via API
When Honcho is available, all stored conclusions SHALL be queryable via Honcho's REST API and TypeScript SDK for use by external tools.

#### Scenario: External tool queries project knowledge
- **WHEN** an external tool calls `conclusions.query()` on the project peer
- **THEN** it receives semantically relevant conclusions from all previous mining runs
