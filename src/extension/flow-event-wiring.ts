/**
 * Flow event wiring: registers listeners for pi-flows events
 * and forwards them as protocol messages to the dashboard server.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { BridgeContext } from "./bridge-context.js";
import { filterHiddenCommands } from "./bridge-context.js";
import type { FlowInfo } from "../shared/types.js";

/** Map of pi-flows event names to dashboard protocol event types */
const FLOW_EVENT_MAP: Record<string, string> = {
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

  for (const [piEvent, eventType] of Object.entries(FLOW_EVENT_MAP)) {
    pi.events.on(piEvent, (data: unknown) => {
      if (!isSessionReady()) return;
      const eventData = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      connection.send({
        type: "event_forward",
        sessionId: bc.sessionId,
        event: {
          eventType,
          timestamp: Date.now(),
          data: eventData,
        },
      });
    });
  }
}
