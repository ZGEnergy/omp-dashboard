# Agent Tool Card Renderer

## Problem

When the `Agent`, `get_subagent_result`, or `steer_subagent` tools are called in a pi session, the dashboard renders them with the `GenericToolRenderer` — raw JSON args and plain text output. This is unreadable, especially for long-running foreground agents that stream `AgentDetails` metadata every ~80ms.

Additionally, the event reducer treats `tool_execution_update.partialResult` as a string, but for Agent tool calls it's actually an object `{ content, details: AgentDetails }`. This means live progress data is lost or garbled.

## Solution

1. **Fix the event reducer** to detect structured `partialResult` objects and store `AgentDetails` on the chat message.
2. **Register custom tool renderers** for `Agent`, `get_subagent_result`, and `steer_subagent` that display rich, live-updating cards.
3. **Fix live→completed status transition** so agent cards don't get stuck on "running" after completion.
4. **Fix replay path** so agent cards render correctly when sessions are loaded from disk.
5. **Always-visible prompt and markdown result** for better readability.

## Data Available

The `AgentDetails` object (sent via `partialResult.details` during foreground runs, and stored in `toolResult.details` in session files) contains:

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | e.g. "general-purpose", "Explore", "Plan" |
| `description` | string | User-provided task description |
| `subagentType` | string | Agent type identifier |
| `status` | string | "queued" / "running" / "completed" / "steered" / "aborted" / "stopped" / "error" / "background" |
| `activity` | string? | Human-readable current action (e.g. "bash $ npm test") |
| `toolUses` | number | Tool calls so far |
| `tokens` | string | Formatted token string (e.g. "33.8k") |
| `turnCount` | number? | Current agentic turn |
| `maxTurns` | number? | Turn limit |
| `durationMs` | number | Elapsed time |
| `modelName` | string? | Model if different from parent |
| `tags` | string[]? | Config tags (e.g. "thinking: high", "isolated") |
| `agentId` | string? | For background agents |
| `error` | string? | Error message |
| `spinnerFrame` | number? | Ignored (TUI-only animation) |

## Scope

### In scope
- Fix `tool_execution_update` in event reducer to handle object `partialResult`
- New `toolDetails` field on `ChatMessage` for structured metadata
- Extract `AgentCardShell` from `FlowAgentCard` — shared card container (status icon, name header, status-based border, stats line) with children slot
- Extract shared `agent-card-utils.ts` (formatTokens, formatDuration, statusIcons)
- Refactor `FlowAgentCard` to use `AgentCardShell` (no behavior change)
- `AgentToolRenderer` component using `AgentCardShell` with live status card
- `GetSubagentResultRenderer` component
- `SteerSubagentRenderer` component
- Register all three in the tool renderer registry
- Fix live status transition: merge `toolDetails.status` to "completed"/"error" on `tool_execution_end` when no `details` in the event (pi SDK doesn't include `details` in live `tool_execution_end`)
- Fix replay path: thread `msg.details` from session file through `state-replay.ts` → `tool_execution_end` event → reducer `toolDetails`
- Always-visible prompt block and markdown-rendered result (using existing `MarkdownContent`)
- Tool summaries for collapsed one-liners (e.g. "Explore: Fix auth bug")
- Auto-expand Agent cards while running
- Stop/force-kill buttons on running tool calls (abort + force kill escalation)
- Subagent lifecycle event handling (`subagent_created/started/completed/failed`) in event reducer

### Out of scope
- Correlating `subagent_*` EventBus events with tool calls (not needed — `AgentDetails` has all the data)
- Changes to the bridge or server event forwarding (data already flows through correctly)

## Card States

**Agent — Running:**
```
┌──────────────────────────────────────────────────┐
│ 🤖 general-purpose                    ⏳ 23.4s   │
│ "Fix the authentication bug"                     │
│                                                  │
│ ⟳12≤30 · 8 tool uses · thinking: high           │
│ ▸ bash $ npm test                                │
│                                                  │
│ PROMPT                                           │
│ Fix the authentication...                        │
└──────────────────────────────────────────────────┘
```

**Agent — Background:**
```
┌──────────────────────────────────────────────────┐
│ 🤖 Explore                       ⏸ background    │
│ "Research caching strategies"                    │
│ Agent ID: abc-123                                │
│ Running in background                            │
└──────────────────────────────────────────────────┘
```

**Agent — Completed:**
```
┌──────────────────────────────────────────────────┐
│ ✅ general-purpose · haiku            23.4s      │
│ "Fix the authentication bug"                     │
│                                                  │
│ ↑12k ↓8k · 15 tool uses · ⟳12≤30               │
│                                                  │
│ PROMPT                                           │
│ Fix the authentication...                        │
│                                                  │
│ RESULT (markdown rendered)                       │
│ The auth bug was caused by...                    │
└──────────────────────────────────────────────────┘
```

**Agent — Error:**
```
┌──────────────────────────────────────────────────┐
│ ❌ general-purpose                     45.2s      │
│ "Fix the authentication bug"                     │
│                                                  │
│ Error: Max turns exceeded                        │
└──────────────────────────────────────────────────┘
```

**get_subagent_result:**
```
┌──────────────────────────────────────────────────┐
│ 📋 Get Agent Result                              │
│ Agent: abc-123 · completed · 34.2s               │
│                                                  │
│ Result                                           │
│ Found three caching approaches...                │
└──────────────────────────────────────────────────┘
```

**steer_subagent:**
```
┌──────────────────────────────────────────────────┐
│ 🎯 Steer Agent · abc-123                        │
│ "Focus on Redis instead of Memcached"            │
└──────────────────────────────────────────────────┘
```

## Implementation Notes

- Reuse visual patterns from `FlowAgentCard` via extracted `AgentCardShell`
- The `ToolCallStep` wrapper handles expand/collapse, status icons, stop/force-kill buttons — the renderer handles the expanded content
- `AgentDetails` flows through `extractSerializable` in the bridge's event forwarder (no bridge changes needed)
- For live sessions: `tool_execution_update` streams `partialResult.details` → reducer stores as `toolDetails` → `tool_execution_end` merges status to "completed"/"error"
- For replayed sessions: `state-replay.ts` includes `msg.details` in `tool_execution_end` events → reducer stores as `toolDetails`
- Result text is rendered with `MarkdownContent` for proper formatting (bold, lists, code blocks, tables)
- Prompt and result are always expanded (no collapsible toggle)
- Parallel background agents work correctly — each has a unique `toolCallId`

## Files Changed

| File | Purpose |
|------|---------|
| `src/client/lib/event-reducer.ts` | `toolDetails` field, structured `partialResult` handling, live status merge on `tool_execution_end`, subagent lifecycle events |
| `src/client/components/agent-card-utils.ts` | Shared `formatTokens`, `formatDuration`, `getStatusIcon` |
| `src/client/components/AgentCardShell.tsx` | Reusable card container: status icon, name, border color, stats, children |
| `src/client/components/FlowAgentCard.tsx` | Refactored to use `AgentCardShell` |
| `src/client/components/tool-renderers/AgentToolRenderer.tsx` | Rich card for Agent tool — all states, markdown result |
| `src/client/components/tool-renderers/GetSubagentResultRenderer.tsx` | Compact card for `get_subagent_result` |
| `src/client/components/tool-renderers/SteerSubagentRenderer.tsx` | Compact card for `steer_subagent` |
| `src/client/components/tool-renderers/registry.ts` | Registered 3 new renderers |
| `src/client/components/tool-renderers/types.ts` | Added `toolDetails` to `ToolRendererProps` |
| `src/client/components/ToolCallStep.tsx` | Tool summaries, auto-expand, `toolDetails` threading, stop/force-kill buttons |
| `src/client/components/ChatView.tsx` | Passes `toolDetails`, `onAbort`, `onForceKill` to `ToolCallStep` |
| `src/shared/state-replay.ts` | Thread `msg.details` into `tool_execution_end` for replay |
| `src/client/lib/__tests__/event-reducer.test.ts` | Tests for structured partialResult, Agent tool lifecycle, subagent events, live status merge |
| `src/extension/__tests__/state-replay.test.ts` | Tests for Agent tool replay with details |
