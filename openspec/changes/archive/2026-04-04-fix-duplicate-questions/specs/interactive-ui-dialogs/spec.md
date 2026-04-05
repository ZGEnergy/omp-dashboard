## MODIFIED Requirements

### Requirement: ask_user Tool Call Rendering

`ToolCallStep` SHALL NOT render `ask_user` tool calls using interactive renderers. When `toolName` is `ask_user`, the component SHALL render a standard collapsible tool step (summary line + expandable raw result), identical to how other tools like `read` or `bash` are rendered.

The interactive UI for ask_user questions SHALL be rendered exclusively by the `interactiveUi` message created from `extension_ui_request`.

#### Scenario: ask_user tool call appears in chat

WHEN a `tool_execution_start` event with `toolName: "ask_user"` is processed
THEN `ToolCallStep` SHALL render a collapsible tool step with summary text derived from the title argument
AND SHALL NOT render an `InteractiveRenderer`

#### Scenario: Interactive UI request appears in chat

WHEN an `extension_ui_request` message is received for an ask_user dialog
THEN a single `interactiveUi` message SHALL be rendered with the appropriate `InteractiveRenderer`
AND this SHALL be the only interactive card for that question
