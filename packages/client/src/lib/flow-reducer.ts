/**
 * Flow state machine reducer.
 * Handles all flow_* events and returns updated FlowState.
 */
import type {
  DashboardEvent,
  FlowAgentState,
  FlowDetailEntry,
  FlowRecentTool,
  FlowState,
  FlowAgentCardConfig,
} from "@blackbelt-technology/pi-dashboard-shared/types.js";

/** Extract a short input preview for tool call display */
function extractToolInputPreview(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  switch (toolName.toLowerCase()) {
    case "read":
    case "write":
    case "edit":
      return String(inp.file_path || inp.path || "").split("/").pop() || "";
    case "grep":
      return String(inp.pattern || "").slice(0, 20);
    case "bash":
      return String(inp.command || "").slice(0, 20);
    case "flow_write":
      return String(inp.name || "");
    default:
      return JSON.stringify(input).slice(0, 20);
  }
}

/**
 * Returns true if the event type is a flow event handled by this reducer.
 */
export function isFlowEvent(eventType: string): boolean {
  return eventType.startsWith("flow_");
}

/**
 * Reduce a flow event into the current FlowState.
 * Returns null when the event creates a new flow (flow_started).
 * Caller should pass current flowState (may be null).
 */
export function reduceFlowEvent(
  flowState: FlowState | null,
  event: DashboardEvent,
): FlowState | null {
  const data = event.data;

  switch (event.eventType) {
    case "flow_started": {
      const steps = data.steps as Array<{
        id: string;
        stepType: string;
        agent?: string;
        blockedBy?: string[];
      }> | undefined;
      const agents = new Map<string, FlowAgentState>();
      if (steps) {
        for (const step of steps) {
          if (step.stepType === "agent" && step.agent) {
            agents.set(step.agent, {
              agentName: step.agent,
              stepId: step.id,
              status: "pending",
              blockedBy: step.blockedBy || [],
              recentTools: [],
              detailHistory: [],
            });
          }
        }
      }
      return {
        flowName: data.flowName as string,
        task: (data.task as string) || "",
        status: "running",
        autonomousMode: (data.autonomousMode as boolean) || false,
        flowSource: (data.source as string) || undefined,
        agents,
      };
    }

    case "flow_agent_started": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const config = data.config as FlowAgentCardConfig | undefined;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      agents.set(agentName, {
        ...(existing || {
          agentName,
          stepId: (data.stepId as string) || agentName,
          blockedBy: [],
          recentTools: [],
          detailHistory: [],
        }),
        status: "running",
        label: config?.card?.label,
        model: config?.model,
        resolvedModel: (data.resolvedModel as string) || undefined,
        cardRole: config?.card?.role,
      });
      return { ...flowState, agents };
    }

    case "flow_agent_complete": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const result = data.result as {
        success: boolean;
        status?: string;
        summary?: string;
        files?: string[];
        tokens?: { input: number; output: number };
        duration?: number;
      } | undefined;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      if (existing) {
        agents.set(agentName, {
          ...existing,
          status: result?.status === "blocked" ? "blocked" : result?.success ? "complete" : "error",
          tokens: result?.tokens,
          duration: result?.duration,
          summary: result?.summary,
          files: result?.files,
        });
      }
      return { ...flowState, agents };
    }

    case "flow_tool_call": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const toolName = data.toolName as string;
      const input = data.input;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      if (existing) {
        const preview = extractToolInputPreview(toolName, input);
        const recentTools: FlowRecentTool[] = [
          ...existing.recentTools,
          { toolName, inputPreview: preview },
        ].slice(-3);
        const detailHistory: FlowDetailEntry[] = [
          ...existing.detailHistory,
          { kind: "tool", toolName, input, isError: false },
        ];
        agents.set(agentName, { ...existing, recentTools, detailHistory });
      }
      return { ...flowState, agents };
    }

    case "flow_tool_result": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      if (existing) {
        const detailHistory = [...existing.detailHistory];
        for (let i = detailHistory.length - 1; i >= 0; i--) {
          const entry = detailHistory[i];
          if (entry.kind === "tool" && entry.output === undefined) {
            detailHistory[i] = {
              ...entry,
              output: data.output,
              isError: (data.isError as boolean) || false,
            };
            break;
          }
        }
        agents.set(agentName, { ...existing, detailHistory });
      }
      return { ...flowState, agents };
    }

    case "flow_assistant_text": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const text = data.text as string;
      if (!text) return flowState;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      if (existing) {
        const detailHistory: FlowDetailEntry[] = [
          ...existing.detailHistory,
          { kind: "text", text },
        ];
        agents.set(agentName, { ...existing, detailHistory });
      }
      return { ...flowState, agents };
    }

    case "flow_thinking_text": {
      if (!flowState) return null;
      const agentName = data.agentName as string;
      const text = data.text as string;
      if (!text) return flowState;
      const agents = new Map(flowState.agents);
      const existing = agents.get(agentName);
      if (existing) {
        const detailHistory: FlowDetailEntry[] = [
          ...existing.detailHistory,
          { kind: "thinking", text },
        ];
        agents.set(agentName, { ...existing, detailHistory });
      }
      return { ...flowState, agents };
    }

    case "flow_loop_iteration": {
      if (!flowState) return null;
      const loopTarget = data.loopTarget as string;
      const iteration = data.iteration as number;
      const maxIterations = data.maxIterations as number;
      if (!loopTarget) return flowState;
      const agents = new Map(flowState.agents);
      const existing = agents.get(loopTarget);
      if (existing) {
        agents.set(loopTarget, {
          ...existing,
          loopIteration: iteration,
          loopMax: maxIterations,
        });
      }
      return { ...flowState, agents };
    }

    case "flow_auto_decision": {
      return flowState;
    }

    case "flow_complete": {
      if (!flowState) return null;
      const status = (data.status as string) || "success";
      return {
        ...flowState,
        status: status as FlowState["status"],
        flowResult: data as Record<string, unknown>,
      };
    }

    case "flow_summary_ready": {
      if (!flowState) return null;
      return {
        ...flowState,
        nextStep: (data.nextStep as string | null) ?? null,
        summaryStats: data.stats as FlowState["summaryStats"],
      };
    }

    case "flow_summary_dismissed": {
      return null;
    }

    default:
      return flowState;
  }
}
