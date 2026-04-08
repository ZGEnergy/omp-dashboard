/**
 * Flow event wiring: registers listeners for pi-flows events
 * and forwards them as protocol messages to the dashboard server.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BridgeContext } from "./bridge-context.js";
import { filterHiddenCommands } from "./bridge-context.js";
import type { FlowInfo } from "../shared/types.js";

/** Map of pi-flows event names to dashboard protocol event types */
export const FLOW_EVENT_MAP: Record<string, string> = {
  "flow:flow-started": "flow_started",
  "flow:agent-started": "flow_agent_started",
  "flow:agent-complete": "flow_agent_complete",
  "flow:subagent-tool-call": "flow_tool_call",
  "flow:subagent-tool-result": "flow_tool_result",
  "flow:assistant-text": "flow_assistant_text",
  "flow:thinking-text": "flow_thinking_text",
  "flow:loop-iteration": "flow_loop_iteration",
  "flow:auto-decision": "flow_auto_decision",
  "flow:complete": "flow_complete",
};

/** Map of pi-subagents event names to dashboard protocol event types */
export const SUBAGENT_EVENT_MAP: Record<string, string> = {
  "subagents:created": "subagent_created",
  "subagents:started": "subagent_started",
  "subagents:completed": "subagent_completed",
  "subagents:failed": "subagent_failed",
};

/**
 * Register flow event listeners on pi.events.
 * Must be called after session_start when pi.events is available.
 *
 * @param bc - Bridge context (mutable state)
 * @param isSessionReady - Function that returns whether session is ready
 * @param getFlowsList - Function to get current flows list
 */
export function registerFlowEventListeners(
  bc: BridgeContext,
  isSessionReady: () => boolean,
  getFlowsList: () => FlowInfo[],
): void {
  const { pi, connection } = bc;
  if (!pi.events) return;

  // Re-send commands and flows list when pi-flows discovers new flows or completes
  const resendCommandsAndFlows = () => {
    if (!isSessionReady()) return;
    const commands = filterHiddenCommands(pi.getCommands());
    connection.send({ type: "commands_list", sessionId: bc.sessionId, commands });
    const flows = getFlowsList();
    connection.send({ type: "flows_list", sessionId: bc.sessionId, flows });
  };
  pi.events.on("flow:rediscover", resendCommandsAndFlows);
  pi.events.on("flow:complete", resendCommandsAndFlows);

  // Note: event_forward sending for flow and subagent events is handled by
  // the EventBus emit intercept in bridge.ts (catch-all forwarding).
}
