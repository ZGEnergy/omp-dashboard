import React, { type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiCloseCircleOutline, mdiCheckCircle, mdiAlertCircle, mdiStopCircle, mdiCloseCircle, mdiCircleOutline } from "@mdi/js";
import type { FlowState } from "../../shared/types.js";

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
}: {
  flowState: FlowState;
  onAgentClick: (agentName: string) => void;
  onDismiss: () => void;
}) {
  const agents = Array.from(flowState.agents.values());
  const { icon, label, color } = statusConfig[flowState.status] ?? statusConfig.success;
  const totalDuration = flowState.flowResult?.totalDuration as number | undefined;
  const totalFiles = agents.reduce((sum, a) => sum + (a.files?.length ?? 0), 0);

  return (
    <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`${color} inline-flex`}>{icon}</span>
        <span className="text-sm text-[var(--text-primary)] flex-1">
          {flowState.flowName} {label}
          <span className="text-[var(--text-tertiary)] ml-1.5">
            · {agents.length} agents
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

      {/* Per-agent status */}
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
              key={agent.agentName}
              onClick={() => onAgentClick(agent.agentName)}
              className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-[var(--bg-tertiary)] rounded px-1 py-0.5"
            >
              <span className={`${agentColor} inline-flex`}><Icon path={agentIconPath} size={0.45} /></span>
              <span className="text-[var(--text-primary)]">{agent.label || agent.agentName}</span>
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
  );
}
