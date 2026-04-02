## Context

The pi-agent-dashboard is a three-component system (bridge extension + Node.js server + React web client) for monitoring pi sessions. The pi-flows extension runs multi-agent workflows in-process using `createAgentSession()` with `SessionManager.inMemory()`, meaning subagents never bootstrap the bridge and are invisible to the dashboard.

pi-flows has clean separation via `FlowObserver` (lifecycle events) and `FlowIOAdapter` (user interaction). The `EventEmitObserver` emits events to `pi.events`, and the `TuiFlowIOAdapter` calls `ctx.ui` methods which the bridge's UI proxy already wraps and races between TUI and dashboard. Fork decisions and subagent `ask_user` calls already work through this proxy.

The local pi-flows installation has been patched to emit all 10 `FlowObserver` events (5 were missing: `flow:flow-started`, `flow:agent-started`, `flow:agent-complete`, `flow:assistant-text`, `flow:thinking-text`).

## Goals / Non-Goals

**Goals:**
- Full flow execution visibility in the web dashboard matching TUI fidelity (live cards, detail, summary)
- Session cards show flow progress and allow launching flows
- Agent detail replaces chat view for full content-area inspection
- Flow controls (abort, autonomous mode) from the dashboard
- Architect widget visibility for `/flows:new` and `/flows:edit`

**Non-Goals:**
- Modifying pi-flows IO adapters or TUI dashboard behavior
- Custom card metric renderers on the web (use generic metric text line from events)
- Breadcrumb/workflow pipeline rendering (TUI-only concept, low value for web)
- Real-time streaming of assistant text in agent cards (batch on `message_end` is sufficient)

## Decisions

### D1: Flow events travel through existing `event_forward` pipeline

**Decision:** The bridge listens to `pi.events` for `flow:*` events and forwards them as `event_forward` messages with flow-specific `eventType` values (e.g., `flow_started`, `flow_agent_started`). No new protocol message types between bridge and server.

**Rationale:** The `event_forward` → `EventMessage` pipeline already handles arbitrary event types. The server stores them in the memory event store, browser clients receive them via `EventMessage`. Adding dedicated message types would duplicate plumbing for no benefit.

**Alternative considered:** Dedicated `FlowStateMessage` sent as a separate protocol path. Rejected — adds complexity to three components instead of reusing existing event forwarding.

### D2: Flow state computed client-side in the event reducer

**Decision:** The event reducer (`event-reducer.ts`) processes flow event types and maintains `FlowState` within `SessionState`. No server-side flow state aggregation.

**Rationale:** Follows the existing pattern — all session UI state is event-sourced in the reducer. The server is a dumb pipe for events. This keeps the server simple and means flow state reconstruction works on page reload via event replay.

**Alternative considered:** Server-side flow state tracked in `MemorySessionManager` and broadcast as `session_updated` partial. Rejected — breaks the event-sourcing model, creates two sources of truth, and requires complex state reconstruction logic on the server.

### D3: Agent detail replaces chat view content area

**Decision:** Clicking an agent card sets a `flowDetailAgent` state in the session view. When set, the content area renders `FlowAgentDetail` instead of `ChatView`. A back button returns to chat. The flow card grid remains visible (sticky top) in both views.

**Rationale:** User confirmed this UX. Full content area gives maximum space for tool call history. Consistent with how `MarkdownPreviewView` replaces the content area for OpenSpec artifact reading.

### D4: Flow card grid is a sticky panel above ChatView

**Decision:** `FlowDashboard` component renders above `ChatView` within the session content area. It uses `position: sticky; top: 0` so it stays visible while chat scrolls beneath it. The grid is responsive — columns computed from container width using the same algorithm as TUI (`Math.min(cardCount, Math.floor(width / minCardWidth))`).

**Rationale:** User requirement: "live cards fixed on top of chat window." Sticky positioning keeps cards visible without stealing vertical space from chat when scrolled down.

### D5: Flow commands detected from existing commands list via heuristic

**Decision:** Available flows are detected from the session's `commands` list (already sent by the bridge). Flow commands are identified by: `source: "extension"` and name NOT in an excluded set of known pi-flows management commands (`flows`, `flows:new`, `flows:edit`, `flows:delete`, `provider`, `roles`, `catalog`). The server doesn't need flow-specific discovery.

**Rationale:** pi-flows auto-registers each flow YAML as a slash command alongside management commands. The bridge already sends `commands_list` on request. Simple exclusion list is sufficient and avoids pi-flows changes.

**Alternative considered:** pi-flows tags flow commands with a marker (e.g., `source: "flow"`). Cleaner but requires upstream changes. Heuristic works for now.

### D6: Flow launcher uses task input dialog + `send_prompt`

**Decision:** Session card shows a flow launcher button/combo when flows are detected. Clicking opens a dialog with a text input for the task/context. On submit, dispatches `send_prompt` with `/<flow-name> <task>`. The same mechanism works from the content area header.

**Rationale:** pi-flows commands already accept a task as the argument to the slash command. Using `send_prompt` requires zero protocol changes and works identically to typing in the TUI.

### D7: Abort and autonomous mode via `flow_control` message + pi.events

**Decision:** A new `flow_control` message type flows from browser → server → bridge. The bridge emits `flow:abort` or `flow:toggle-autonomous` on `pi.events`. pi-flows has been patched to listen for both events: `flow:abort` calls `flowManager.abort()`, `flow:toggle-autonomous` calls `setAutonomousMode(!isAutonomousMode())`. The bridge also includes current autonomous mode state in `flow_started` events.

**Rationale:** Abort and autonomous toggle are internal pi-flows functions with no slash command equivalents. Using `pi.events` as the bridge-to-pi-flows communication channel follows the existing pattern (same as `flow:run`, `flow:rediscover`). Two small event listeners were added to pi-flows locally.

### D8: Architect widget reuses flow dashboard infrastructure

**Decision:** The Flow Architect (`/flows:new`, `/flows:edit`) spawns a single agent. It emits the same `flow:*` events (flow-started with one agent step, agent tool calls, agent complete). The dashboard shows a single-card flow dashboard for architect sessions. Save/replan/cancel decisions come through as fork-like `ui.select()` prompts, which the UI proxy already forwards.

**Rationale:** The architect is just a single-agent flow. No special architect-specific infrastructure needed on the dashboard side — it's rendered using the same card grid (with 1 card) and the same interactive dialog system.

### D9: Session card flow status badge follows OpenSpec badge pattern

**Decision:** New `FlowActivityBadge` component renders below the `OpenSpecActivityBadge` in the session card. Shows flow name, agent progress (e.g., "2/4 agents"), and a status icon. Data comes from `DashboardSession` — new fields `activeFlowName`, `flowAgentsDone`, `flowAgentsTotal`, `flowStatus`.

**Rationale:** Follows existing pattern. Session-level flow metadata is tracked by the server from `flow_started` and `flow_agent_complete` events, added to `DashboardSession` updates.

## Risks / Trade-offs

- **[High-frequency events]** → `flow:subagent-tool-call` fires on every tool call across all agents. For flows with many parallel agents, this could be chatty. Mitigation: the bridge already buffers events; tool call events are small. If needed, debounce assistant-text/thinking-text events.

- **[pi-flows version coupling]** → The dashboard depends on pi-flows emitting specific event shapes. If pi-flows changes event payloads, the dashboard breaks silently. Mitigation: defensive parsing in the reducer; type the expected shapes but don't crash on missing fields.

- **[Large FlowResult on complete]** → `flow:complete` sends the full `FlowResult` which includes all step outputs. For large flows this could be significant. Mitigation: the bridge could trim large text fields (e.g., cap at 10KB per agent output).

- **[Autonomous mode state sync]** → Dashboard needs to know if autonomous mode is on/off, but this is pi-flows internal state not exposed via events. Mitigation: bridge reads `isAutonomousMode()` at flow start and on toggle; sends state with flow events.

- **[Mobile viewport]** → Card grid with 4+ agents could consume 50%+ of mobile screen height. Mitigation: on mobile, collapse to a thin status bar (flow name + progress count) with tap-to-expand.
