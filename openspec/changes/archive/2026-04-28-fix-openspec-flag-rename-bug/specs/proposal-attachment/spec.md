## ADDED Requirements

### Requirement: Activity detector rejects flag-shaped change names
`detectOpenSpecActivity` SHALL NOT return a `changeName` whose first character is `-`. When a CLI regex (archive, new-change, or `--change` flag) captures a token starting with `-`, the function SHALL return `null` instead of a `DetectedActivity` with that token. This prevents downstream auto-attach and auto-rename from being driven by CLI flags such as `--help`.

#### Scenario: openspec archive --help is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec archive --help"`
- **THEN** the result SHALL be `null`

#### Scenario: openspec new change --help is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec new change --help"`
- **THEN** the result SHALL be `null`

#### Scenario: --change flag followed by another flag is ignored
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec foo --change --help"`
- **THEN** the result SHALL be `null`

#### Scenario: Real change names are still extracted
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `"openspec archive add-auth"`
- **THEN** the result SHALL be `{ changeName: "add-auth", isActive: true }`

#### Scenario: Quoted change names are still extracted
- **WHEN** `detectOpenSpecActivity` is called with tool `"bash"` and command `'openspec archive "add-auth"'`
- **THEN** the result SHALL be `{ changeName: "add-auth", isActive: true }`
