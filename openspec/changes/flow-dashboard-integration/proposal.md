## Why

The pi-flows extension provides a rich TUI dashboard for multi-agent workflow orchestration — live agent cards, detail overlays, fork decisions, summary widgets — but all of this is invisible to the pi-agent-dashboard web UI. When a flow runs, the web dashboard shows the session as idle while the terminal shows a live grid of agents. Users monitoring sessions remotely (mobile, browser, team dashboards) have zero visibility into flow execution. Since subagent sessions are in-process (`SessionManager.inMemory()`), they don't bootstrap the bridge extension and are fundamentally invisible to the dashboard without explicit event forwarding.

## What Changes

- **pi-flows `EventEmitObserver`**: Complete the 5 missing `FlowObserver` events (`flow:flow-started`, `flow:agent-started`, `flow:agent-complete`, `flow:assistant-text`, `flow:thinking-text`) so all flow lifecycle data is available via `pi.events`. This is a prerequisite change in the pi-flows package (local modification + report for upstream).
- **Bridge extension**: Listen to all `flow:*` events on `pi.events` and forward them as `event_forward` messages with flow-specific event types to the dashboard server.
- **Dashboard server**: Store per-session flow state (active flow, agent card states, tool history) in memory and broadcast flow events to connected browser clients.
- **Browser protocol**: Add flow-specific browser messages for flow state snapshots and incremental updates.
- **React client**: New `FlowDashboard` component rendered as a sticky panel at the top of `ChatView` when a flow is active, showing a responsive grid of agent cards with live status, tool calls, tokens, duration, and loop badges.
- **Agent detail view**: Click an agent card to replace the chat view with a full content-area detail view showing complete tool call history, assistant text, and thinking traces for that agent. Back button returns to the chat view with card grid.
- **Flow summary**: After flow completion, replace the card grid with a summary showing per-agent status, LLM-generated insights (if available from the `flow:complete` result), duration, and file counts.
- **Flow controls**: Abort flow button and autonomous mode toggle in the flow dashboard header. Uses dedicated protocol messages (`abort_flow`, `toggle_autonomous`) with fallback to prompt-based dispatch.
- **Flow triggering**: Dashboard can list available flows, pick one, enter a task, and launch it on a session. Uses the existing command dispatch (`send_prompt` with `/<flow-name> <task>`).
- **Architect widget**: `/flows:new` and `/flows:edit` spawn the Flow Architect agent. The dashboard shows architect progress, tool call history, DAG preview, and the save/replan/cancel decision cycle.
- **Session card flow status**: When a flow is running, the session card shows a flow activity badge below the OpenSpec section — flow name, agent progress (e.g. "2/4 agents"), and status (running/complete/error/aborted). Follows the same pattern as `OpenSpecActivityBadge`.
- **Session card flow launcher**: When a session has available flows (detected from the commands list), the session card shows a flow action section — a combo box or button to pick a flow and launch it. A dialog appears to enter the task/context before starting. Follows the same pattern as `SessionOpenSpecActions`.
- **Fork decisions**: Already work via the existing UI proxy (`ctx.ui.select/confirm/input` are raced between TUI and dashboard). No IO adapter changes needed — the `TuiFlowIOAdapter` calls `ctx.ui` which the bridge already wraps. Subagent `ask_user` calls also already route through the `AskUserQueue` → `ctx.ui` → bridge proxy pipeline.

## Capabilities

### New Capabilities
- `flow-event-bridge`: Bridge extension captures `flow:*` events from `pi.events` and forwards them to the dashboard server as enriched `event_forward` messages with flow-specific event types.
- `flow-server-state`: Server maintains per-session flow execution state (active flow metadata, per-agent card states with status/tokens/duration/tool history) and broadcasts incremental updates to browser clients.
- `flow-browser-protocol`: Browser WebSocket protocol additions for flow state snapshots and incremental flow event updates.
- `flow-card-grid`: Responsive React card grid component showing live agent status, recent tool calls, token usage, duration, model role, loop iteration badges, and blocked-by dependencies. Sticky-positioned at top of ChatView.
- `flow-agent-detail`: Clickable agent cards replace the chat view with a full content-area detail view showing tool call history (tool name, input preview, output, error status), assistant text blocks, and thinking traces. Back button returns to chat.
- `flow-summary-view`: Post-completion summary replacing the card grid, showing flow outcome, per-agent status with file counts, total duration, and insight lines extracted from the `FlowResult`.
- `flow-controls`: Abort flow button and autonomous mode toggle in the flow dashboard header. Dedicated protocol messages (`abort_flow`, `toggle_autonomous`) with prompt-based fallback.
- `flow-trigger`: List available flows for a session, select one, enter a task, and launch it remotely. Uses existing `send_prompt` with `/<flow-name> <task>` syntax.
- `flow-architect-view`: Architect widget for `/flows:new` and `/flows:edit` — shows agent progress, tool calls, DAG preview, save/replan/cancel decision cycle forwarded via existing UI proxy.
- `flow-card-status`: Session card badge showing active flow name and agent progress (e.g. "research-and-build · 2/4 agents"), rendered below the OpenSpec activity badge. Same compact style as `OpenSpecActivityBadge`.
- `flow-card-launcher`: Session card action section for launching flows — combo box listing available flows (detected from commands list where `source: "extension"` and name matches flow patterns), with a task input dialog before dispatch.

### Modified Capabilities
- `shared-protocol`: New `event_forward` event types for flow lifecycle (`flow_started`, `flow_agent_started`, `flow_agent_complete`, `flow_tool_call`, `flow_tool_result`, `flow_assistant_text`, `flow_thinking_text`, `flow_loop_iteration`, `flow_auto_decision`, `flow_complete`).
- `bridge-extension`: Bridge listens to `pi.events` for `flow:*` events and forwards them alongside existing pi lifecycle events.
- `event-reducer`: Recognizes flow event types and maintains flow state within `SessionState` (active flow, agent cards map, tool history per agent).
- `session-listing`: Session cards display flow activity badge and flow launcher action section.

## Impact

- **pi-flows package** (external): Requires completing `EventEmitObserver` with 5 missing methods (~30 lines, additive, zero risk to existing behavior). A detailed report is prepared for the upstream developer.
- **Bridge extension** (`src/extension/bridge.ts`): New `pi.events` listeners for `flow:*` events, forwarded via existing `event_forward` mechanism.
- **Shared types** (`src/shared/types.ts`): New flow state interfaces (`FlowState`, `FlowAgentCard`, `FlowDetailEntry`).
- **Browser protocol** (`src/shared/browser-protocol.ts`): New message types for flow state delivery.
- **Server** (`src/server/`): Flow state tracking in memory event store or session manager, broadcast to browser clients.
- **Client** (`src/client/`): New components — `FlowDashboard`, `FlowAgentCard`, `FlowAgentDetail`, `FlowSummary`, `FlowControls`. Integration into `ChatView` layout.
- **Event reducer** (`src/client/lib/event-reducer.ts`): Flow event handling to maintain flow state in `SessionState`.
- **No changes** to pi-flows IO adapters, TUI dashboard, fork decision handling, or subagent ask_user pipeline — these all work through existing `ctx.ui` proxy.
