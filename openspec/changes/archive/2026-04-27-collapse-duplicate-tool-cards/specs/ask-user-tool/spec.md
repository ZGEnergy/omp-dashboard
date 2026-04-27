## ADDED Requirements

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
