## 1. Debug Tools Hook

- [x] 1.1 Create `src/client/hooks/useDebugToolsVisible.ts` with `DEBUG_TOOL_NAMES` set, `isDebugTool()` helper, and `useDebugToolsVisible()` localStorage-backed hook (default: false)

## 2. ChatView Filtering

- [x] 2.1 Filter `rawEvent` role messages in ChatView — skip rendering when `showDebugTools` is false
- [x] 2.2 Filter `toolResult` messages where `toolName` matches `isDebugTool()` — skip rendering when `showDebugTools` is false

## 3. Settings Toggle

- [x] 3.1 Add "Chat Display" section to Settings → Advanced tab with `DebugToolsToggle` component
- [x] 3.2 Wire toggle to `useDebugToolsVisible` hook with label "Show debug events (raw events, flow:list-flows, resources_discover)"
