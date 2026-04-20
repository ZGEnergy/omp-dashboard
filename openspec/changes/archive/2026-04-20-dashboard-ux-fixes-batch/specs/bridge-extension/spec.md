## MODIFIED Requirements

### Requirement: Skill command intercepts and injects SKILL.md
When a `/skill:<name>` command is sent from the dashboard, the bridge extension's `sessionPrompt` handler SHALL detect the skill command pattern, look up the skill's SKILL.md path from `pi.getCommands()`, read the file content, and send it as a user message so the LLM receives the skill context. If the skill is not found, the command SHALL be sent as-is (fallback to current behavior).

#### Scenario: Known skill command injects SKILL.md content
- **WHEN** the user sends `/skill:openspec-explore` from the dashboard
- **THEN** the bridge looks up "skill:openspec-explore" in `pi.getCommands()`
- **AND** reads the SKILL.md file at the command's `path` field
- **AND** sends the SKILL.md content as a user message to the LLM

#### Scenario: Unknown skill falls back to plain message
- **WHEN** the user sends `/skill:nonexistent` from the dashboard
- **AND** no matching command with `source: "skill"` exists
- **THEN** the text is sent as a regular user message (current behavior)

#### Scenario: Skill command with additional text
- **WHEN** the user sends `/skill:openspec-explore some additional context`
- **THEN** the SKILL.md content is sent followed by the additional context text
