import React, { useState, type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiCloseCircleOutline, mdiCheckCircle, mdiAlertCircle, mdiStopCircle, mdiCloseCircle, mdiCircleOutline, mdiChevronRight, mdiChevronDown, mdiFileDocumentOutline } from "@mdi/js";
import type { FlowState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { FlowGraph, type FlowGraphStep, type FlowStepType } from "./FlowGraph.js";

const SEPARATOR_STEP_TYPES = new Set(["fork", "conditional", "agent-decision", "agent-loop-decision", "flow-ref"]);

function synthesizeImplicitEdges(
  steps: FlowGraphStep[],
  dagSteps: NonNullable<FlowState["dagSteps"]>,
): void {
  const allStepIds = new Set(steps.map(s => s.id));
  const stepById = new Map(steps.map(s => [s.id, s]));
  for (const ds of dagSteps) {
    if (ds.exitTarget && allStepIds.has(ds.exitTarget)) {
      const target = stepById.get(ds.exitTarget);
      if (target && !target.blockedBy.includes(ds.id)) {
        target.blockedBy = [...target.blockedBy, ds.id];
      }
    }
  }
  for (let i = 1; i < dagSteps.length; i++) {
    const curr = stepById.get(dagSteps[i].id);
    if (!curr || curr.blockedBy.length > 0) continue;
    for (let j = i - 1; j >= 0; j--) {
      const prev = dagSteps[j];
      if ((SEPARATOR_STEP_TYPES.has(prev.stepType) || prev.stepType === "agent") && allStepIds.has(prev.id)) {
        curr.blockedBy = [prev.id];
        break;
      }
    }
  }
}

function mapStepType(stepType: string): FlowStepType | undefined {
  switch (stepType) {
    case "fork": case "conditional": case "agent-decision": return "fork";
    case "agent-loop-decision": return "loop";
    case "flow-ref": return "flow-ref";
    default: return undefined;
  }
}

/** Map FlowState to FlowGraphStep array for summary view.
 *  Uses dagSteps when available for full graph, falls back to agents map. */
function agentsToGraphSteps(flowState: FlowState): FlowGraphStep[] {
  if (flowState.dagSteps && flowState.dagSteps.length > 0) {
    const stepStatus = new Map<string, FlowGraphStep["status"]>();
    for (const [key, agent] of flowState.agents) {
      stepStatus.set(key, agent.status);
      if (agent.stepId) stepStatus.set(agent.stepId, agent.status);
      stepStatus.set(agent.agentName, agent.status);
    }
    const allStepIds = new Set(flowState.dagSteps.map(s => s.id));
    const steps = flowState.dagSteps.map(step => ({
      id: step.id,
      label: step.id,
      status: stepStatus.get(step.id) || stepStatus.get(step.agent || "") || "pending",
      blockedBy: step.blockedBy.filter(dep => allStepIds.has(dep)),
      type: mapStepType(step.stepType),
      loopTarget: step.loopTarget && allStepIds.has(step.loopTarget) ? step.loopTarget : undefined,
    }));
    // Synthesize implicit edges (exit_target, segment ordering)
    synthesizeImplicitEdges(steps, flowState.dagSteps);
    return steps;
  }
  // Fallback: agents-only
  const stepToAgent = new Map<string, string>();
  for (const agent of flowState.agents.values()) {
    if (agent.stepId) stepToAgent.set(agent.stepId, agent.agentName);
  }
  return Array.from(flowState.agents.values()).map(agent => ({
    id: agent.agentName,
    label: agent.label || agent.agentName,
    status: agent.status,
    blockedBy: agent.blockedBy
      .map(depId => stepToAgent.get(depId) || depId)
      .filter(name => flowState.agents.has(name)),
  }));
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
}

const statusConfig: Record<string, { icon: ReactNode; label: string; color: string }> = {
  success: { icon: <Icon path={mdiCheckCircle} size={0.55} />, label: "complete", color: "text-green-400" },
  error: { icon: <Icon path={mdiAlertCircle} size={0.55} />, label: "failed", color: "text-red-400" },
  aborted: { icon: <Icon path={mdiStopCircle} size={0.55} />, label: "aborted", color: "text-orange-400" },
};

export function FlowSummary({
  flowState,
  onAgentClick,
  onDismiss,
  onSendPrompt,
  onViewYaml,
}: {
  flowState: FlowState;
  onAgentClick: (agentName: string) => void;
  onDismiss: () => void;
  onSendPrompt?: (text: string) => void;
  onViewYaml?: () => void;
}) {
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
            steps={agentsToGraphSteps(flowState)}
          />
          {onViewYaml && (
            <div className="mt-1">
              <button
                onClick={onViewYaml}
                className="text-[var(--text-tertiary)] hover:text-blue-400 transition-colors p-0.5 rounded hover:bg-[var(--bg-surface)] inline-flex items-center"
                title="View flow YAML"
              >
                <Icon path={mdiFileDocumentOutline} size={0.5} />
              </button>
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
                  onClick={() => onAgentClick(agent.stepId || agent.agentName)}
                  className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-[var(--bg-tertiary)] rounded px-1 py-0.5"
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
