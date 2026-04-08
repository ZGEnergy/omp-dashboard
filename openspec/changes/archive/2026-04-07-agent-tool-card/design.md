## Context

The dashboard renders all tool calls through a `ToolCallStep` → `ToolRenderer` pipeline. A registry maps tool names to custom renderers (`read` → `ReadToolRenderer`, etc.), falling back to `GenericToolRenderer` which dumps raw JSON.

The `Agent` tool (from `@tintinweb/pi-subagents`) uses pi's `onUpdate` callback to stream `AgentDetails` metadata every ~80ms during foreground execution. This arrives as `tool_execution_update` events where `partialResult` is an object `{ content, details }` — but the event reducer casts it as `string`, losing all structured data.

The `AgentDetails` type contains: `displayName`, `description`, `subagentType`, `status`, `activity`, `toolUses`, `tokens`, `turnCount`, `maxTurns`, `durationMs`, `modelName`, `tags`, `agentId`, `error`.

## Goals / Non-Goals

**Goals:**
- Render `Agent`, `get_subagent_result`, and `steer_subagent` tool calls as rich cards
- Show live progress for foreground agents (activity, tool count, duration, turns)
- Display completion stats (tokens, duration, tool uses) and result text
- Handle all agent statuses: running, background, completed, steered, stopped, error, aborted

**Non-Goals:**
- Correlating `subagent_*` EventBus events with tool calls (AgentDetails has all needed data)
- Modifying the bridge or server event forwarding (data already flows correctly)
- Adding new WebSocket message types

## Decisions

### 1. Pass `toolDetails` through existing `ToolRendererProps`

**Decision**: Add an optional `toolDetails?: Record<string, unknown>` field to `ChatMessage` and thread it through to `ToolRendererProps`.

**Rationale**: The `ToolRendererProps` interface is the contract for all renderers. Adding `toolDetails` keeps it generic — any tool can attach structured metadata. The alternative (renderer-specific data channels) would require per-tool plumbing.

**Alternative considered**: Extend `ToolRendererProps` with an `AgentDetails`-specific field. Rejected because it couples the generic interface to one extension's types.

### 2. Detect structured `partialResult` in event reducer

**Decision**: In the `tool_execution_update` handler, check if `partialResult` is an object. If so, extract `details` into `toolDetails` on the `ChatMessage`, and stringify `content` for the existing `result` field.

**Rationale**: Minimal change — the existing string path continues to work for all other tools. Only structured results get the new field populated.

### 3. One renderer file per tool

**Decision**: Create `AgentToolRenderer.tsx`, `GetSubagentResultRenderer.tsx`, and `SteerSubagentRenderer.tsx` as separate files in `tool-renderers/`.

**Rationale**: Follows the existing pattern (`ReadToolRenderer.tsx`, `BashToolRenderer.tsx`, etc.). Each tool has distinct display needs. The `get_subagent_result` and `steer_subagent` renderers are simple enough to be small files.

### 4. Extract AgentCardShell from FlowAgentCard

**Decision**: Create an `AgentCardShell` component that owns the shared card pattern: status-colored border, header row (icon + name), and stat line. Both `FlowAgentCard` and `AgentToolRenderer` compose it. Extract `formatTokens`, `formatDuration`, and `statusIcons` into a shared `agent-card-utils.ts` module.

**Rationale**: `FlowAgentCard` and the new `AgentToolRenderer` share the same visual structure — status icon, name header, stats, status-based border color. Extracting the shell avoids duplication and ensures visual consistency. The shell accepts children for tool-specific content (recent tools for flows, activity/result for subagents).

**Alternative considered**: Duplicate the helpers inline. Rejected because both `FlowAgentCard` and `AgentToolRenderer` need them, violating DRY from the start.

### 5. Add Agent-specific summary to ToolCallStep

**Decision**: Add entries to `toolSummaries` in `ToolCallStep.tsx` for `Agent`, `get_subagent_result`, and `steer_subagent` so the collapsed one-liner is descriptive.

**Rationale**: The collapsed view is the most common interaction — users expand only when they need detail. A good summary like "▸ Explore: Fix auth bug" is immediately scannable.

### 6. Auto-expand Agent cards while running

**Decision**: `ToolCallStep` currently initializes `expanded` to `false` (except for images). For `Agent` tool calls with status `running`, default to expanded so users see live progress.

**Rationale**: Agent calls are long-running (seconds to minutes). Hiding progress behind a click defeats the purpose of streaming `AgentDetails`.

## Risks / Trade-offs

**[Risk] `partialResult` shape varies across pi versions** → Check for object type defensively; fall back to string rendering if structure doesn't match expected shape.

**[Risk] High-frequency updates (every 80ms) could cause render thrash** → The reducer already clones messages array on update. React's reconciliation handles this well for a single updating card. If needed, throttle in the reducer (skip updates within 200ms).

**[Trade-off] Duplicating format helpers vs. extracting to shared module** → Keep helpers inline in the renderer for now. If a third consumer appears, extract to `src/client/lib/format-utils.ts`.

**[Trade-off] `toolDetails` is untyped (`Record<string, unknown>`)** → Each renderer casts to its expected shape. This keeps the generic interface clean but pushes type safety to the renderer level.
