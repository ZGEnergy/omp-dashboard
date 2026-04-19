## ADDED Requirements

### Requirement: Strict parameter schema per method

The `ask_user` tool SHALL declare its parameters as a discriminated union over `method`, where each branch enforces the fields required to render a usable dialog.

- `confirm` branch: `title` (required string), `message` (optional string).
- `select` branch: `title` (required string), `options` (required array of strings with at least 2 entries), `message` (optional string).
- `multiselect` branch: `title` (required string), `options` (required array of strings with at least 1 entry), `message` (optional string).
- `input` branch: `title` (required string), `placeholder` (optional string), `message` (optional string).

#### Scenario: select call missing options is rejected by schema
- **WHEN** an LLM calls `ask_user` with `{method: "select", title: "Pick one"}` (no `options`)
- **THEN** the tool's parameter schema SHALL reject the call
- **AND** the LLM SHALL receive a validation error describing the missing `options` field

#### Scenario: select call with single option is rejected by schema
- **WHEN** an LLM calls `ask_user` with `{method: "select", title: "Pick", options: ["only"]}`
- **THEN** the tool's parameter schema SHALL reject the call because `options` has fewer than 2 entries

#### Scenario: confirm call without options is accepted
- **WHEN** an LLM calls `ask_user` with `{method: "confirm", title: "Proceed?"}`
- **THEN** the tool's parameter schema SHALL accept the call (confirm does not require `options`)

#### Scenario: input call without options is accepted
- **WHEN** an LLM calls `ask_user` with `{method: "input", title: "Your name?"}`
- **THEN** the tool's parameter schema SHALL accept the call (input does not require `options`)

### Requirement: Defensive argument rescue for common LLM shape mistakes

The `ask_user` tool's `prepareArguments` SHALL repair known malformed argument shapes before validation so that equivalent-intent calls succeed instead of producing unusable dialogs.

#### Scenario: arguments wrapped in a JSON-encoded `params` string
- **WHEN** an LLM calls `ask_user` with `{method: "select", params: "{\"title\":\"Pick\",\"options\":[\"a\",\"b\"]}"}`
- **THEN** `prepareArguments` SHALL parse the `params` string and merge its fields into the top-level arguments
- **AND** the resulting call SHALL be equivalent to `{method: "select", title: "Pick", options: ["a","b"]}`

#### Scenario: arguments wrapped in an object `params` field
- **WHEN** an LLM calls `ask_user` with `{method: "select", params: {title: "Pick", options: ["a","b"]}}`
- **THEN** `prepareArguments` SHALL spread the `params` object into the top-level arguments
- **AND** the resulting call SHALL be equivalent to `{method: "select", title: "Pick", options: ["a","b"]}`

#### Scenario: `question` used instead of `title`
- **WHEN** an LLM calls `ask_user` with `{method: "input", question: "Your name?"}`
- **AND** no `title` field is present
- **THEN** `prepareArguments` SHALL copy `question` into `title`
- **AND** the resulting call SHALL be equivalent to `{method: "input", title: "Your name?"}`

#### Scenario: existing options-string rescue still works
- **WHEN** an LLM calls `ask_user` with `{method: "select", title: "Pick", options: "[\"a\",\"b\"]"}`
- **THEN** `prepareArguments` SHALL parse the `options` JSON string into an array
- **AND** the resulting call SHALL be equivalent to `{method: "select", title: "Pick", options: ["a","b"]}`

### Requirement: Runtime refusal of empty options

The `ask_user` tool's `execute` SHALL throw a descriptive error if `method` is `select` or `multiselect` and the effective `options` array is empty or not an array, so that the LLM receives clear corrective feedback instead of the user seeing an unusable dialog with only a Cancel button.

#### Scenario: select reaches execute with empty options
- **WHEN** `execute` is invoked with `{method: "select", title: "Pick", options: []}`
- **THEN** the tool SHALL throw an error whose message identifies `options` as the problem
- **AND** the error message SHALL suggest using `method: "input"` if no options are available
- **AND** no prompt SHALL be sent to the PromptBus

#### Scenario: multiselect reaches execute with missing options
- **WHEN** `execute` is invoked with `{method: "multiselect", title: "Pick"}` and `options` is undefined
- **THEN** the tool SHALL throw an error whose message identifies `options` as the problem
- **AND** no prompt SHALL be sent to the PromptBus
