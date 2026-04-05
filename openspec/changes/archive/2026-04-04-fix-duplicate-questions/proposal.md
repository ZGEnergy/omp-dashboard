## Why

When the `ask_user` tool is invoked, the same question renders twice in the chat view. The tool execution creates a `toolResult` message (rendered by `ToolCallStep` with an `InteractiveRenderer`), and the ui-proxy also sends an `extension_ui_request` that creates a separate `interactiveUi` message (rendered by `InteractiveUiCard` with the same renderer). Users see duplicate interactive cards for every question.

## What Changes

- Stop rendering `ask_user` tool calls as full interactive cards in `ToolCallStep` — render them as normal collapsible tool steps instead
- The live interactive UI card from `extension_ui_request` remains the single source of interactive rendering

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `interactive-ui-dialogs`: Remove duplicate rendering path — `ask_user` tool calls should not render as interactive cards in `ToolCallStep`

## Impact

- `src/client/components/ToolCallStep.tsx` — Remove the `ask_user` → `InteractiveRenderer` branch; render as a standard collapsible tool step
- No API, protocol, or server changes needed
