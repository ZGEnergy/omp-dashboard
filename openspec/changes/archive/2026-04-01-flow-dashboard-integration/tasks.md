## 1. Shared Types & Protocol

- [x] 1.1 Add flow state types to `src/shared/types.ts`: `FlowAgentCard` (name, label, status, model, tokens, duration, recentTools, loopIteration, loopMax, blockedBy), `FlowState` (flowName, task, status, agents, autonomousMode, flowResult), and extend `DashboardSession` with optional flow fields (activeFlowName, flowAgentsDone, flowAgentsTotal, flowStatus)
- [x] 1.2 Add `FlowControlExtensionMessage` to `src/shared/protocol.ts` (server → extension: `{ type: "flow_control", sessionId, action: "abort" | "toggle_autonomous" }`) and add to `ServerToExtensionMessage` union
- [x] 1.3 Add `FlowControlBrowserMessage` to `src/shared/browser-protocol.ts` (browser → server: `{ type: "flow_control", sessionId, action: "abort" | "toggle_autonomous" }`) and add to `BrowserToServerMessage` union

## 2. Bridge Extension — Flow Event Forwarding

- [x] 2.1 In `src/extension/bridge.ts`, register `pi.events` listeners for all 10 `flow:*` events (guarded by `pi.events` availability). Map each to an `event_forward` message with the corresponding `flow_*` eventType. Include `autonomousMode` state in `flow_started` events.
- [x] 2.2 In `src/extension/bridge.ts`, handle incoming `flow_control` messages from the server — `abort` emits `flow:abort` on `pi.events`, `toggle_autonomous` emits `flow:toggle-autonomous` on `pi.events` (pi-flows listens for both)

## 3. Server — Flow State & Routing

- [x] 3.1 In `src/server/event-status-extraction.ts`, extract flow metadata from `flow_started`, `flow_agent_complete`, and `flow_complete` events to update `DashboardSession` fields (activeFlowName, flowAgentsDone, flowAgentsTotal, flowStatus)
- [x] 3.2 In `src/server/browser-gateway.ts`, handle `flow_control` browser messages — route `abort` to the extension's abort message, route `toggle_autonomous` to a new `flow_control` extension message

## 4. Event Reducer — Client-Side Flow State

- [x] 4.1 Add `FlowAgentState` and `FlowState` interfaces to `src/client/lib/event-reducer.ts`. Add `flowState: FlowState | null` to `SessionState` and `createInitialState()`
- [x] 4.2 Implement `flow_started` event handler: create `FlowState` with agents pre-populated from steps array in pending status
- [x] 4.3 Implement `flow_agent_started` handler: update agent status to running, store config metadata
- [x] 4.4 Implement `flow_agent_complete` handler: update agent status, store tokens/duration/summary/files
- [x] 4.5 Implement `flow_tool_call` and `flow_tool_result` handlers: append to agent toolHistory, update recentTools (last 3)
- [x] 4.6 Implement `flow_assistant_text` and `flow_thinking_text` handlers: append to agent detailHistory
- [x] 4.7 Implement `flow_loop_iteration` handler: update target agent's loopIteration/loopMax
- [x] 4.8 Implement `flow_auto_decision` handler: record in flow state for display
- [x] 4.9 Implement `flow_complete` handler: update flowState.status, store flowResult

## 5. Flow Card Grid Component

- [x] 5.1 Create `src/client/components/FlowAgentCard.tsx` — individual agent card component with status icon, name/label, model role, recent tools list (3 items), token/duration stats, loop badge. Use Tailwind styling matching existing card design.
- [x] 5.2 Create `src/client/components/FlowDashboard.tsx` — header line (flow name + progress), responsive card grid (CSS grid with `minmax(200px, 1fr)`), abort button, autonomous mode toggle. Accepts `FlowState` as prop.
- [x] 5.3 Integrate `FlowDashboard` into session content area — render as sticky panel above `ChatView` when `flowState` is not null. On mobile, collapse to a thin status bar (flow name + progress) with tap-to-expand. Wire abort and autonomous toggle to send `flow_control` browser messages.

## 6. Flow Agent Detail View

- [x] 6.1 Create `src/client/components/FlowAgentDetail.tsx` — full content-area view with back button, agent header (name, status, model, tokens, duration), chronological list of tool calls / assistant text / thinking blocks. Reuse existing `ToolCallStep` and `ThinkingBlock` components where possible.
- [x] 6.2 Add `flowDetailAgent: string | null` state to the session view. When set, render `FlowAgentDetail` instead of `ChatView`. Wire card clicks to set this state, back button to clear it.

## 7. Flow Summary View

- [x] 7.1 Create `src/client/components/FlowSummary.tsx` — summary panel replacing the card grid after flow completion. Shows status icon + flow name + duration + agent count, per-agent status lines (clickable to open detail), file counts, dismiss button.
- [x] 7.2 Wire summary into `FlowDashboard` — when `flowState.status` is not `"running"`, render `FlowSummary` instead of card grid. Dismiss clears `flowState`.

## 8. Session Card — Flow Badge & Launcher

- [x] 8.1 Create `src/client/components/FlowActivityBadge.tsx` — compact badge (11px, same style as `OpenSpecActivityBadge`) showing "🔄 flowName · N/M agents" for running, "✓ flowName" for complete, "⚠ flowName" for error
- [x] 8.2 Integrate `FlowActivityBadge` into `SessionCard.tsx` — render below `OpenSpecActivityBadge` when session has `activeFlowName`
- [x] 8.3 Create `src/client/components/FlowLaunchDialog.tsx` — dialog with flow name, description, text input for task, submit/cancel buttons
- [x] 8.4 Create `src/client/components/SessionFlowActions.tsx` — flow launcher section for the session card. Detect flow commands from commands list using heuristic: `source: "extension"` and name NOT in excluded set (`flows`, `flows:new`, `flows:edit`, `flows:delete`, `provider`, `roles`, `catalog`). Show combo/button to pick a flow, open `FlowLaunchDialog` on selection, dispatch `send_prompt` with `/<flowName> <task>`
- [x] 8.5 Integrate `SessionFlowActions` into `SessionCard.tsx` — render below `SessionOpenSpecActions` when flow commands are available

## 9. Flow Trigger from Content Header

- [x] 9.1 Add "Run Flow" button to `SessionHeader.tsx` — visible when flow commands are available. Opens the same `FlowLaunchDialog`. Wire to `send_prompt`.

## 10. Tests

- [x] 10.1 Unit tests for event reducer flow event handling — test all flow event types produce correct `FlowState` transitions
- [x] 10.2 Unit tests for flow command detection from commands list
- [x] 10.3 Integration test: bridge flow event forwarding (server-side extraction tests) — verify `pi.events` flow events produce correct `event_forward` messages
