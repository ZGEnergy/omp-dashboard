## ADDED Requirements

### Requirement: Failed-then-retried tool calls collapse into a pill
The chat view SHALL collapse a `toolResult` message with `toolStatus: "error"` into a one-line badge when the very next non-skip message is a `toolResult` of the same `toolName` whose `toolStatus` is NOT `"error"` (i.e. `"complete"` or `"running"`). The badge SHALL display the tool name and the text "failed — retried" with a small alert icon. Clicking the badge SHALL expand it to the full original error card (a standard `ToolCallStep` with `status: "error"` showing the validation error and `Received arguments:` JSON); clicking again SHALL collapse it back to the badge. Skip roles for the look-ahead are `assistant`, `thinking`, `turnSeparator`, `rawEvent`, and `commandFeedback`. The look-ahead aborts on `user`, a different-tool `toolResult`, or a chained same-tool `error` — those error cards continue to render in full.

#### Scenario: Empty-args ask_user followed by valid retry
- **WHEN** the message stream contains a `toolResult` for `ask_user` with `toolStatus: "error"` (validation message complaining about missing `method` / `title`) followed (after intervening `thinking` / `assistant` messages) by another `toolResult` for `ask_user` with `toolStatus: "complete"`
- **THEN** the chat view SHALL render the first `toolResult` as a single-line "ask_user failed — retried" pill instead of the full red validation card

#### Scenario: Standalone error stays expanded
- **WHEN** a `toolResult` has `toolStatus: "error"` AND no subsequent same-tool `toolResult` exists in the message stream
- **THEN** the chat view SHALL render it as the full standard `ToolCallStep` error card (no collapse)

#### Scenario: Chained errors stay expanded
- **WHEN** two consecutive same-tool `toolResult` messages both have `toolStatus: "error"`
- **THEN** the chat view SHALL render BOTH as full error cards (the first is not considered "retried" because the next attempt also failed)

#### Scenario: Different-tool boundary
- **WHEN** an error `toolResult` for tool A is followed by a complete `toolResult` for tool B
- **THEN** the chat view SHALL render the tool-A error as a full card (no collapse)

#### Scenario: User-message boundary
- **WHEN** an error `toolResult` is followed by a `user` message before any retry
- **THEN** the chat view SHALL render the error as a full card (no collapse) — a user reply ends the auto-retry window

#### Scenario: Expand and recollapse the pill
- **WHEN** the user clicks an expanded "failed — retried" pill
- **THEN** the chat view SHALL render the full original error `ToolCallStep` plus a "Hide failed attempt" toggle

- **WHEN** the user clicks the "Hide failed attempt" toggle
- **THEN** the chat view SHALL collapse the error back to the one-line pill

### Requirement: Running toolResult hidden during paired pending interactiveUi
The chat view SHALL hide (return `null` from the message renderer) any `toolResult` message whose `toolStatus` is `"running"` AND whose very next non-skip message is an `interactiveUi` message with `args.status === "pending"`. Skip roles are the same as for the retry-pill helper. This prevents duplicate rendering of the same question during the active state. Once the `interactiveUi` resolves (`status` becomes `"resolved"`, `"cancelled"`, or `"dismissed"`), the running toolResult SHALL still be hidden only as long as `toolStatus` remains `"running"`; once the `tool_execution_end` event flips it to `"complete"`, the toolResult is no longer matched by the helper and SHALL render normally as a full tool-call card in history.

#### Scenario: Pending ask_user shows only the interactive card
- **WHEN** an `ask_user` tool is mid-execution, a `toolResult` exists with `toolStatus: "running"`, and the next non-skip message is an `interactiveUi` with `status: "pending"`
- **THEN** the chat view SHALL render only the `InteractiveUiCard` (with Allow/Deny/Cancel buttons) and SHALL hide the running `toolResult`

#### Scenario: Resolved tool history shows the full tool card
- **WHEN** the user has answered the `ask_user` prompt, the `interactiveUi.args.status` is `"resolved"`, and the corresponding `toolResult.toolStatus` is `"complete"`
- **THEN** the chat view SHALL render the full `ToolCallStep` (showing the question + `User responded:` result), and the `InteractiveUiCard` SHALL render its compact one-line resolved-state pill (e.g. `mdi-shield-alert ▸ Allowed`)

#### Scenario: Skip-roles do not break pairing
- **WHEN** a running `toolResult` is followed by `thinking` and `assistant` messages and THEN a pending `interactiveUi`
- **THEN** the chat view SHALL still hide the running `toolResult`

#### Scenario: Different intervening tool breaks pairing
- **WHEN** a running `toolResult` for tool A is followed by a `toolResult` for tool B BEFORE any `interactiveUi`
- **THEN** the chat view SHALL render the tool-A running card normally (no hide)

#### Scenario: Standalone running tool with no interactive UI
- **WHEN** a `toolResult` is `running` and no subsequent `interactiveUi` exists
- **THEN** the chat view SHALL render the running card normally
