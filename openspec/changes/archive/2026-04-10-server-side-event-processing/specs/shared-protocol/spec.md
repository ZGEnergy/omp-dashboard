## MODIFIED Requirements

### Requirement: Remove openspec_activity_update from ExtensionToServerMessage
The `OpenSpecActivityUpdateMessage` type SHALL be removed from the `ExtensionToServerMessage` union. The server detects OpenSpec activity directly from forwarded `tool_execution_start` events.

#### Scenario: openspec_activity_update not in union
- **WHEN** the protocol types are compiled
- **THEN** `ExtensionToServerMessage` SHALL NOT include `OpenSpecActivityUpdateMessage`

### Requirement: Remove stats_update from ExtensionToServerMessage
The `StatsUpdateMessage` type SHALL be removed from the `ExtensionToServerMessage` union. The server extracts stats directly from forwarded `turn_end` events.

#### Scenario: stats_update not in union
- **WHEN** the protocol types are compiled
- **THEN** `ExtensionToServerMessage` SHALL NOT include `StatsUpdateMessage`
