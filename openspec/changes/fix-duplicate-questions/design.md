## Context

`ToolCallStep` has special-case logic: when `toolName === "ask_user"`, it bypasses the normal collapsible tool rendering and instead delegates to `getInteractiveRenderer()`. This was added to show ask_user results inline with rich UI. However, the ui-proxy already sends `extension_ui_request` which creates a separate `interactiveUi` chat message with the same interactive renderer. The result: every ask_user question appears twice.

## Goals / Non-Goals

**Goals:**
- Remove duplicate question rendering — each ask_user invocation should show exactly once
- Keep the live interactive card (from `extension_ui_request`) as the primary UI for answering questions

**Non-Goals:**
- Changing the ui-proxy or bridge protocol
- Changing how non-ask_user tools render

## Decisions

1. **Remove the ask_user special case from `ToolCallStep`** — Delete the `if (toolName === "ask_user")` branch. The `ask_user` tool call will render as a standard collapsible tool step (like `read`, `bash`, etc.), showing the summary line "ask_user: <title>" with an expand toggle for the raw result.

2. **Keep the `interactiveUi` message as the interactive UI** — This is already the correct path: it supports pending/resolved/cancelled states and forwards responses back through the WebSocket.

This is the simplest fix: one conditional block removed, no new code needed.

## Risks / Trade-offs

- **Historical ask_user calls in replay**: When replaying old events, the `tool_execution_start` + `tool_execution_end` events still appear. They'll now show as a normal tool step (collapsed). The interactive card from `extension_ui_request` shows the resolved state. This is fine — the tool step provides context that a question was asked, the interactive card shows the answer.
- **If `extension_ui_request` is missing** (e.g. older sessions without ui-proxy): The tool step still shows the ask_user with its raw result text, just not as a rich interactive card. Acceptable degradation.
