## ADDED Requirements

### Requirement: ask_user resolved icon uses help-circle in sky-blue
The `ToolCallStep` header SHALL render a sky-blue `mdi-help-circle-outline` (`?`) icon instead of the standard green `mdi-check` icon when both of the following are true: the `toolName` is `"ask_user"` AND the `status` is `"complete"`. This visually distinguishes resolved user-interaction prompts from ordinary tool executions in the chat history. The override SHALL NOT apply when `status === "running"` (which continues to show the yellow `mdi-loading` spinner) or when `status === "error"` (which continues to show the red `mdi-alert-circle` icon), so existing in-flight and failure semantics are preserved.

#### Scenario: Resolved ask_user shows sky-blue help icon
- **WHEN** a `toolResult` with `toolName: "ask_user"` and `toolStatus: "complete"` is rendered by `ToolCallStep`
- **THEN** the header icon SHALL be `mdi-help-circle-outline` and the wrapper class SHALL include `text-sky-400`

#### Scenario: Running ask_user keeps yellow spinner
- **WHEN** a `toolResult` with `toolName: "ask_user"` and `toolStatus: "running"` is rendered (and is not hidden by the paired-pending-interactiveUi rule)
- **THEN** the header icon SHALL be `mdi-loading` (spinning) and the wrapper class SHALL include `text-yellow-400`

#### Scenario: Errored ask_user keeps red alert
- **WHEN** a `toolResult` with `toolName: "ask_user"` and `toolStatus: "error"` is rendered (either as a full card or expanded from a `RetriedErrorBadge`)
- **THEN** the header icon SHALL be `mdi-alert-circle` and the wrapper class SHALL include `text-red-400`

#### Scenario: Other tools unaffected
- **WHEN** a `toolResult` with `toolName !== "ask_user"` and `toolStatus: "complete"` is rendered
- **THEN** the header icon SHALL be `mdi-check` and the wrapper class SHALL include `text-green-400` (unchanged from the pre-existing behavior)
