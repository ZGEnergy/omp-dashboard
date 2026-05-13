import React, { useState, type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiCloseCircleOutline, mdiCheckCircle, mdiAlertCircle, mdiStopCircle, mdiCloseCircle, mdiCircleOutline, mdiChevronRight, mdiChevronDown } from "@mdi/js";
import type { DashboardSession, FlowState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import { useUiPrimitive, usePluginSend } from "@blackbelt-technology/dashboard-plugin-runtime";
import { FlowGraph, flowStateToGraphSteps } from "./FlowGraph.js";
import { FlowYamlPopoverButton } from "./FlowYamlPopoverButton.js";
import { useFlowsSessionState } from "./FlowsSessionStateContext.js";


// formatDuration moved to registry primitive lookup inside FlowSummary
// (PH-2 fix from validation report).


const statusConfig: Record<string, { icon: ReactNode; label: string; color: string }> = {
  success: { icon: <Icon path={mdiCheckCircle} size={0.55} />, label: "complete", color: "text-green-400" },
  error: { icon: <Icon path={mdiAlertCircle} size={0.55} />, label: "failed", color: "text-red-400" },
  aborted: { icon: <Icon path={mdiStopCircle} size={0.55} />, label: "aborted", color: "text-orange-400" },
};

export function FlowSummary({
  flowState,
  onDismiss,
  onSendPrompt,
}: {
  flowState: FlowState;
  onDismiss: () => void;
  onSendPrompt?: (text: string) => void;
}) {
  const formatDuration = useUiPrimitive(UI_PRIMITIVE_KEYS.formatDuration);
  const [collapsed, setCollapsed] = useState(false);
  const agents = Array.from(flowState.agents.values());
  const { icon, label, color } = statusConfig[flowState.status] ?? statusConfig.success;
  const totalDuration = flowState.flowResult?.totalDuration as number | undefined;
  const totalFiles = agents.reduce((sum, a) => sum + (a.files?.length ?? 0), 0);

  return (
    <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-flex text-[var(--text-tertiary)] cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.6} />
        </span>
        <span className={`${color} inline-flex`}>{icon}</span>
        <span className="text-sm text-[var(--text-primary)] flex-1">
          {flowState.flowName} {label}
          <span className="text-[var(--text-tertiary)] ml-1.5">
            · {agents.length} steps
            {totalDuration ? ` · ${formatDuration(totalDuration)}` : ""}
            {totalFiles > 0 ? ` · ${totalFiles} files` : ""}
          </span>
        </span>
        <button
          onClick={onDismiss}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <Icon path={mdiCloseCircleOutline} size={0.4} className="inline mr-0.5" />Dismiss
        </button>
      </div>

      {/* DAG graph + Agent list -- collapsible */}
      <div className={`group-collapse ${collapsed ? "collapsed" : "expanded"}`}>
        <div>
          {/* DAG graph showing final state */}
          <FlowGraph
            steps={flowStateToGraphSteps(flowState)}
          />
          {flowState.flowSource && (
            <div className="mt-1">
              <FlowYamlPopoverButton
                flowSource={flowState.flowSource}
                flowName={flowState.flowName}
              />
            </div>
          )}

          {/* Per-agent status list */}
          <div className="space-y-0.5">
            {agents.map(agent => {
              const agentIconPath = agent.status === "complete" ? mdiCheckCircle
                : agent.status === "error" ? mdiCloseCircle
                : agent.status === "blocked" ? mdiAlertCircle
                : mdiCircleOutline;
              const agentColor = agent.status === "complete" ? "text-green-400"
                : agent.status === "error" ? "text-red-400"
                : agent.status === "blocked" ? "text-orange-400"
                : "text-[var(--text-tertiary)]";
              const fileCount = agent.files?.length ?? 0;

              return (
                <div
                  key={agent.stepId || agent.agentName}
                  className="flex items-center gap-1.5 text-[11px] hover:bg-[var(--bg-tertiary)] rounded px-1 py-0.5"
                >
                  <span className={`${agentColor} inline-flex`}><Icon path={agentIconPath} size={0.45} /></span>
                  <span className="text-[var(--text-primary)]">{agent.label || agent.stepId || agent.agentName}</span>
                  {(agent.stepType === "fork" || agent.stepType === "agent-decision") && (
                    <span className="text-[9px] text-amber-400/60">◇</span>
                  )}
                  {agent.stepType === "agent-loop-decision" && (
                    <span className="text-[9px] text-purple-400/60">↻</span>
                  )}
                  {fileCount > 0 && (
                    <span className="text-[var(--text-muted)]">({fileCount} files)</span>
                  )}
                  {agent.summary && (
                    <span className="text-[var(--text-tertiary)] truncate flex-1">{agent.summary}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Next step suggestion */}
      {flowState.nextStep && onSendPrompt && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => onSendPrompt(`/${flowState.nextStep}`)}
            className="text-[11px] px-2 py-1 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            Next: /{flowState.nextStep}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Slot-consumer wrapper for the `content-inline-footer` claim. Self-
 * derives flow state, dispatches dismissal via pluginContext.send,
 * navigates agent detail via the plugin-internal UI state context.
 * Returns null when no flow is active. See change:
 * pluginize-flows-via-registry.
 */
export function FlowSummaryClaim({ session }: { session: DashboardSession }) {
  const { flowState } = useFlowsSessionState(session.id);
  const send = usePluginSend();

  if (!flowState) return null;

  return (
    <FlowSummary
      flowState={flowState}
      onDismiss={() =>
        send({ type: "flow_control", sessionId: session.id, action: "dismiss_summary" })
      }
      onSendPrompt={(text) =>
        send({ type: "send_prompt", sessionId: session.id, text })
      }
    />
  );
}
