## 1. Event Reducer — Structured partialResult

- [x] 1.1 Add `toolDetails?: Record<string, unknown>` field to `ChatMessage` interface
- [x] 1.2 Update `tool_execution_update` handler to detect object `partialResult`, extract `details` into `toolDetails` and stringify `content` for `result`
- [x] 1.3 Write tests for structured vs string partialResult handling

## 2. Tool Summaries and Auto-Expand

- [x] 2.1 Add `Agent`, `get_subagent_result`, `steer_subagent` entries to `toolSummaries` in `ToolCallStep.tsx`
- [x] 2.2 Update `ToolCallStep` to default `expanded` to `true` when `toolName` is `"Agent"` and `status` is `"running"`

## 3. ToolRendererProps — Thread toolDetails

- [x] 3.1 Add `toolDetails?: Record<string, unknown>` to `ToolRendererProps` interface
- [x] 3.2 Pass `toolDetails` from `ChatMessage` through `ChatView` → `ToolCallStep` → renderer

## 4. Extract AgentCardShell from FlowAgentCard

- [x] 4.1 Create `agent-card-utils.ts` with shared `formatTokens`, `formatDuration`, and `statusIcons` (extracted from `FlowAgentCard`)
- [x] 4.2 Create `AgentCardShell.tsx` — reusable card container with status icon, name header, status-based border color, and stats line. Accepts children for tool-specific content.
- [x] 4.3 Refactor `FlowAgentCard` to use `AgentCardShell` and shared utils (behavior must remain identical)

## 5. AgentToolRenderer

- [x] 5.1 Create `AgentToolRenderer.tsx` using `AgentCardShell`, with running state card (display name, description, activity, tool count, turns, elapsed time, model, tags)
- [x] 5.2 Add completed/steered state rendering (stats summary, collapsible result)
- [x] 5.3 Add background state rendering (agent ID, "running in background")
- [x] 5.4 Add error/aborted/stopped state rendering
- [x] 5.5 Add fallback rendering when `toolDetails` is absent

## 6. Supporting Renderers

- [x] 6.1 Create `GetSubagentResultRenderer.tsx` (agent ID, status, collapsible result)
- [x] 6.2 Create `SteerSubagentRenderer.tsx` (agent ID, steering message)

## 7. Registry and Integration

- [x] 7.1 Register `Agent`, `get_subagent_result`, `steer_subagent` renderers in `registry.ts`
- [x] 7.2 Verify end-to-end with a real agent call (manual test — deferred to user)
