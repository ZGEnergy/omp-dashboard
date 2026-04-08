## Why

The chat view displays internal/debug events like `tool_call`, `tool_result`, `turn_start` (orange raw event cards) and framework tool calls like `flow:list-flows` and `resources_discover`. These clutter the conversation for regular users and have no value outside of debugging. They should be hidden by default with an opt-in toggle for developers who need them.

## What Changes

- Hide all `rawEvent` messages (orange cards: `tool_call`, `tool_result`, `turn_start`, etc.) by default in ChatView
- Hide debug tool calls (`flow:list-flows`, `flow:rediscover`, `resources_discover`) by default
- Add a "Show debug events" toggle in Settings → Advanced under a new "Chat Display" section
- Persist the preference in `localStorage` (client-only, no server config needed)

### Components involved:

**New hook** — `useDebugToolsVisible.ts`:
- `DEBUG_TOOL_NAMES` set of known debug tool names
- `isDebugTool(toolName)` pure helper
- `useDebugToolsVisible()` hook backed by `localStorage("show-debug-tools")`, default `false`

**ChatView** — filter messages before rendering:
- Skip `rawEvent` role messages when toggle is off
- Skip `toolResult` messages where `toolName` matches a debug tool name

**SettingsPanel** — new section in Advanced tab:
- "Chat Display" section with a toggle: "Show debug events (raw events, flow:list-flows, resources_discover)"

## Capabilities

### New Capabilities

- `hide-debug-events`: Client-side filtering of internal/debug events from the chat stream, with opt-in toggle in Settings → Advanced.

### Modified Capabilities

_(none)_

## Impact

- **Code**: 3 files changed (ChatView, SettingsPanel) + 1 new hook file
- **Dependencies**: None
- **UX**: Cleaner chat view by default; developers can re-enable via Settings → Advanced
- **Breaking changes**: None — events are still received and stored, just not rendered
