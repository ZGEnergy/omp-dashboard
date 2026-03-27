## MODIFIED Requirements

### Requirement: Activity detector catches openspec new change positional syntax
The `detectOpenSpecActivity` function SHALL detect change names from `openspec new change "name"` commands in addition to the existing `--change` flag pattern.

#### Scenario: Detect change name from openspec new change
- **WHEN** a Bash tool execution contains command `openspec new change "my-feature"`
- **THEN** `detectOpenSpecActivity` SHALL return `{ changeName: "my-feature" }`

#### Scenario: Detect change name from openspec new change without quotes
- **WHEN** a Bash tool execution contains command `openspec new change my-feature`
- **THEN** `detectOpenSpecActivity` SHALL return `{ changeName: "my-feature" }`

#### Scenario: Detect change name from openspec new change with schema flag
- **WHEN** a Bash tool execution contains command `openspec new change "my-feature" --schema spec-driven`
- **THEN** `detectOpenSpecActivity` SHALL return `{ changeName: "my-feature" }`

#### Scenario: Existing --change flag detection still works
- **WHEN** a Bash tool execution contains command `openspec status --change "my-feature" --json`
- **THEN** `detectOpenSpecActivity` SHALL return `{ changeName: "my-feature" }` as before
