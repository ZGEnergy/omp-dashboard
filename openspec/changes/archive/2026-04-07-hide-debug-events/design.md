## Context

The ChatView renders all events received from the server, including internal framework events (`tool_call`, `tool_result`, `turn_start`) as orange `RawEventCard` components and debug tool calls (`flow:list-flows`, `resources_discover`) as `ToolCallStep` components. These events are useful for debugging but clutter the conversation for regular users.

The implementation is client-only — events are still received and stored, just filtered at render time.

## Goals / Non-Goals

**Goals:**
- Hide debug/internal events from the chat stream by default
- Provide an opt-in toggle in Settings → Advanced for developers
- Persist the preference across sessions via localStorage

**Non-Goals:**
- Server-side event filtering (events are still forwarded and stored)
- Per-session or per-event-type granular filtering
- Filtering flow-related events that are already handled by the flow reducer

## Decisions

### Client-side localStorage instead of server config
**Rationale**: This is a pure display preference. Using localStorage avoids a server round-trip, works offline, and doesn't require config schema changes. The server config (`~/.pi/dashboard/config.json`) is reserved for settings that affect server behavior.

### Filter at render time in ChatView instead of in the event reducer
**Rationale**: Events should still be accumulated in state for completeness. Filtering at render is simpler and reversible — toggling the setting instantly shows/hides events without replaying the event stream.

### Two filter categories: rawEvent role + named debug tools
**Rationale**: `rawEvent` messages are always internal (unrecognized event types rendered as JSON). Named debug tools (`flow:list-flows`, `flow:rediscover`, `resources_discover`) are recognized tool calls that serve no user-facing purpose.

## Risks / Trade-offs

- [Hidden events may mask issues] → Toggle is easily discoverable in Settings → Advanced; developers can enable it when debugging
- [New debug tools added later won't be auto-hidden] → The `DEBUG_TOOL_NAMES` set is easy to extend; raw events are always hidden regardless
