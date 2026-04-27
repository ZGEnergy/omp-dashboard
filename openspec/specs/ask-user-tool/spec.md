# ask-user-tool Specification

## Purpose
TBD - created by archiving change ask-user-message-body. Update Purpose after archive.
## Requirements
### Requirement: ask_user tool parameters
The `ask_user` tool SHALL accept a `message` parameter (optional string) described as "Additional context or detailed question body (all methods)" that works with all methods, not just confirm.

#### Scenario: LLM provides message with input method
- **WHEN** the LLM calls `ask_user` with `{method: "input", title: "Check log", message: "Run this command:\n```\ntype log.txt\n```"}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.input()`

#### Scenario: LLM provides message with select method
- **WHEN** the LLM calls `ask_user` with `{method: "select", title: "Pick one", message: "Context about the choice", options: ["A", "B"]}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.select()`

#### Scenario: LLM provides message with multiselect method
- **WHEN** the LLM calls `ask_user` with `{method: "multiselect", title: "Pick items", message: "Select all that apply"}`
- **THEN** the tool SHALL pass `message` through `opts.message` to `ctx.ui.multiselect()`

#### Scenario: No message provided
- **WHEN** the LLM calls `ask_user` without a `message` field
- **THEN** the tool SHALL behave identically to the current implementation (backward compatible)

### Requirement: Strict parameter schema per method

The `ask_user` tool SHALL declare its parameters as a discriminated union over `method`, where each branch enforces the fields required to render a usable dialog.

- `confirm` branch: `title` (required string), `message` (optional string).
- `select` branch: `title` (required string), `options` (required array of strings with at least 2 entries), `message` (optional string).
- `multiselect` branch: `title` (required string), `options` (required array of strings with at least 1 entry), `message` (optional string).
- `input` branch: `title` (required string), `placeholder` (optional string), `message` (optional string).
- `batch` branch: `title` (required string), `questions` (required array of single-question objects with at least 1 entry), `message` (optional string).

#### Scenario: batch branch requires at least one sub-question
- **WHEN** an LLM calls `ask_user` with `{method: "batch", title: "X", questions: []}`
- **THEN** the tool's parameter schema SHALL reject the call

#### Scenario: batch branch rejects sub-question with outer-only fields
- **WHEN** a batch sub-question contains `questions: [...]` (nested batch)
- **THEN** the tool's parameter schema SHALL reject the call (batch cannot nest)

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

### Requirement: Batch question method

The `ask_user` tool SHALL accept a `batch` method that asks multiple related questions in a single tool call, returning an ordered array of answers.

A batch call has the shape:

```
{
  method: "batch",
  title: string,               // Header shown above the sequence of dialogs
  questions: Question[],       // At least 1; each is a single-question object
  message?: string             // Optional additional context for the whole batch
}
```

Where each `Question` is one of the existing non-batch shapes (`confirm`, `select`, `multiselect`, `input`) with all its normal required fields (`method`, `title`, and `options` where applicable). Sub-questions MAY include their own optional `message` field — when present it is shown on that specific sub-dialog; the outer batch `message` is shown as context on every sub-dialog.

#### Scenario: batch call with mixed question types
- **WHEN** an LLM calls `ask_user` with `{method: "batch", title: "Project setup", questions: [{method: "input", title: "Project name?"}, {method: "select", title: "Language?", options: ["TypeScript", "Python"]}, {method: "confirm", title: "Initialize git?"}]}`
- **THEN** the tool SHALL prompt the user sequentially: first input, then select, then confirm
- **AND** the tool SHALL return `{content: [...], details: {method: "batch", results: [<answer1>, <answer2>, <answer3>]}}`
- **AND** the `content` text SHALL include all three answers in order

#### Scenario: batch call with single question
- **WHEN** an LLM calls `ask_user` with `{method: "batch", title: "One thing", questions: [{method: "confirm", title: "Proceed?"}]}`
- **THEN** the tool SHALL execute the single sub-question via `ctx.ui.confirm`
- **AND** the result SHALL be a one-element array

#### Scenario: batch call with empty questions array is rejected
- **WHEN** an LLM calls `ask_user` with `{method: "batch", title: "Nothing", questions: []}`
- **THEN** the tool's parameter schema SHALL reject the call because `questions` has fewer than 1 entry

#### Scenario: batch call with invalid sub-question is rejected
- **WHEN** an LLM calls `ask_user` with `{method: "batch", title: "Bad", questions: [{method: "select", title: "Pick"}]}` (sub-question missing `options`)
- **THEN** the tool's parameter schema SHALL reject the call
- **AND** the validation error SHALL identify which sub-question failed

### Requirement: Batch cancellation semantics

If the user cancels any sub-question during a batch call, the tool SHALL stop prompting further sub-questions and return the partial results collected so far, flagged as cancelled.

#### Scenario: user cancels mid-batch
- **WHEN** a batch is executing and the user cancels the second of three sub-questions
- **THEN** the tool SHALL NOT prompt the third sub-question
- **AND** the tool SHALL return `details: {method: "batch", cancelled: true, results: [<answer1>, null]}`
- **AND** the `content` text SHALL indicate the batch was cancelled and include the partial answers

#### Scenario: user cancels first sub-question
- **WHEN** a batch is executing and the user cancels the first sub-question
- **THEN** the tool SHALL return `details: {method: "batch", cancelled: true, results: [null]}`
- **AND** no further sub-questions SHALL be prompted

### Requirement: Argument rescue for batch shapes

The `ask_user` tool's `prepareArguments` SHALL repair known malformed batch shapes before validation.

#### Scenario: `questions` array sent as a JSON string
- **WHEN** an LLM calls `ask_user` with `{questions: "[{\"method\":\"select\",\"title\":\"Pick\",\"options\":[\"a\",\"b\"]}]"}` (no top-level `method`)
- **THEN** `prepareArguments` SHALL parse the `questions` string into an array
- **AND** SHALL synthesize `method: "batch"` at the top level
- **AND** SHALL synthesize `title: <first question's title>` if none is present
- **AND** the resulting call SHALL validate against the `batch` schema branch

#### Scenario: single-question wrapped in `questions` array
- **WHEN** an LLM calls `ask_user` with `{questions: [{method: "confirm", title: "Proceed?"}]}` (no top-level `method`, array not stringified)
- **THEN** `prepareArguments` SHALL synthesize `method: "batch"` and a `title` from the first sub-question
- **AND** the resulting call SHALL validate against the `batch` schema branch

#### Scenario: legacy `{label, value}` options in a sub-question
- **WHEN** a batch sub-question has `options: [{label: "Sync now", value: "sync"}, {label: "Skip", value: "skip"}]`
- **THEN** `prepareArguments` SHALL normalize each entry to its `label` string, producing `options: ["Sync now", "Skip"]`
- **AND** the returned tool result SHALL include a warning in `details` noting that value fields were discarded

#### Scenario: `input_type` wrapper in a sub-question
- **WHEN** a batch sub-question has `{header: "...", question: "...", input_type: {method: "select", options: [...]}}`
- **THEN** `prepareArguments` SHALL flatten `input_type` fields to the top of the sub-question
- **AND** SHALL rename `header` or `question` to `title`
- **AND** the resulting sub-question SHALL match one of the single-question schema branches

#### Scenario: explicit method=batch call missing outer title
- **WHEN** an LLM calls `ask_user` with `{method: "batch", questions: [{method: "confirm", question: "Proceed?"}, ...]}` (explicit `method: "batch"` but no outer `title`)
- **THEN** `prepareArguments` SHALL backfill `title` from the first sub-question's `title`, `question`, or `header` (or `"Questions"` as a last-resort fallback)
- **AND** the resulting call SHALL validate against the `batch` schema branch




### Requirement: Schema imports use the typebox package

`packages/extension/src/ask-user-tool.ts` and its tests SHALL import the TypeBox schema factory from the `typebox` package, not from `@sinclair/typebox`.

This aligns with the pi 0.69.0+ TypeBox 1.x migration. pi-coding-agent still aliases the legacy `@sinclair/typebox` root package for backward compatibility, but the alias is documented as legacy and `@sinclair/typebox/compiler` is no longer shimmed. Migrating now removes the dashboard's last consumer of the deprecated path.

#### Scenario: Production import
- **WHEN** `packages/extension/src/ask-user-tool.ts` declares its TypeBox import
- **THEN** the import specifier SHALL be `"typebox"` (not `"@sinclair/typebox"`)
- **AND** the `Type.*` factory calls used to build the discriminated-union schema SHALL continue to compile and produce the same runtime schema shape

#### Scenario: Test mock target
- **WHEN** `packages/extension/src/__tests__/ask-user-tool.test.ts` mocks the schema factory via `vi.mock(...)`
- **THEN** the mocked module specifier SHALL be `"typebox"` (matching the production import)

#### Scenario: No /compiler subpath usage
- **WHEN** any file under `packages/extension/src/` imports from TypeBox
- **THEN** it SHALL NOT import from `"@sinclair/typebox/compiler"` or `"typebox/compiler"`
- **AND** schema validation SHALL continue to flow through pi's tool-argument validator


### Requirement: prepareArguments preserves empty-args rejection
The `ask_user` tool's `prepareArguments` rescue layer SHALL NOT synthesize a `method`, `title`, or `questions` field when the input is an empty object `{}`. The framework's runtime schema validator MUST continue to reject empty-args invocations so the model is forced to retry with valid arguments. The rescue layer's existing transformations (unwrap `params`, rename `question` → `title`, parse stringified `options`, synthesize `method: "batch"` from a non-empty `questions` array, normalize `[{label,value}]` → `[label]`, etc.) all require at least one input field to fire and SHALL remain no-ops on `{}`.

#### Scenario: Empty-args call stays empty
- **WHEN** `prepareArguments({})` is called
- **THEN** it SHALL return an object with no `method`, no `title`, and no `questions` properties (the only allowed extra is the non-enumerable `__normalizations` array, which MUST be empty)

#### Scenario: Schema rejection still fires for empty args
- **WHEN** the model emits a `tool_use` block for `ask_user` with `input: {}`
- **THEN** the framework's runtime schema validator SHALL reject it with `Validation failed for tool "ask_user"` listing the union arms' missing required properties (`method, title`, `method, title, options`, `method, title, questions`)

#### Scenario: Real rescue cases still apply
- **WHEN** `prepareArguments({ questions: [{ method: "confirm", title: "Proceed?" }] })` is called (no top-level `method`)
- **THEN** it SHALL return `{ method: "batch", title: "Proceed?", questions: [...] }` — the synthesis depends on a non-empty `questions` array, so this scenario is NOT regressed by the empty-args contract
