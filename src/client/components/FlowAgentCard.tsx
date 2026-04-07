import React, { type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiCircleOutline, mdiLoading, mdiCheckCircle, mdiCloseCircle, mdiAlertCircle, mdiRefresh } from "@mdi/js";
import type { FlowAgentState } from "../../shared/types.js";

const statusIcons: Record<string, { icon: ReactNode; color: string }> = {
  pending: { icon: <Icon path={mdiCircleOutline} size={0.55} />, color: "text-[var(--text-tertiary)]" },
  running: { icon: <Icon path={mdiLoading} size={0.55} className="animate-spin" />, color: "text-yellow-400" },
  complete: { icon: <Icon path={mdiCheckCircle} size={0.55} />, color: "text-green-400" },
  error: { icon: <Icon path={mdiCloseCircle} size={0.55} />, color: "text-red-400" },
  blocked: { icon: <Icon path={mdiAlertCircle} size={0.55} />, color: "text-orange-400" },
};

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return Math.round(n / 1000) + "k";
}

function formatDuration(ms: number): string {
  const sec = ms / 1000;
  return sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
}

export function FlowAgentCard({
  agent,
  onClick,
  selected,
}: {
  agent: FlowAgentState;
  onClick?: () => void;
  selected?: boolean;
}) {
  const { icon, color } = statusIcons[agent.status] ?? statusIcons.pending;
  const displayName = agent.label || agent.agentName;
  const displayRole = agent.cardRole || agent.model || "";

  const isComplete = agent.status === "complete" || agent.status === "error" || agent.status === "blocked";

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border p-2.5 cursor-pointer transition-all duration-150 hover:shadow-md
        ${selected ? "border-blue-500/60 bg-[var(--bg-surface)]" : "border-[var(--border-subtle)] bg-[var(--bg-tertiary)]"}
        ${agent.status === "running" ? "border-yellow-500/30" : ""}
        ${agent.status === "error" ? "border-red-500/30" : ""}
      `}
    >
      {/* Header: icon + name + loop badge */}
      <div className="flex items-center gap-1.5">
        <span className={`${color} inline-flex`}>{icon}</span>
        <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">{displayName}</span>
        {agent.loopIteration != null && agent.loopIteration > 0 && (
          <span className="text-[10px] text-blue-400 flex-shrink-0 inline-flex items-center gap-0.5"><Icon path={mdiRefresh} size={0.4} />{agent.loopIteration}/{agent.loopMax}</span>
        )}
      </div>

      {/* Role or tokens line */}
      <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">
        {isComplete && agent.tokens ? (
          <span>↑{formatTokens(agent.tokens.input)} ↓{formatTokens(agent.tokens.output)} · {formatDuration(agent.duration ?? 0)}</span>
        ) : displayRole ? (
          <span>{displayRole}</span>
        ) : null}
      </div>

      {/* Metric / waiting line */}
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
        {agent.status === "pending" && agent.blockedBy.length > 0 ? (
          <span>waiting: {agent.blockedBy.join(", ")}</span>
        ) : null}
      </div>

      {/* Recent tools */}
      <div className="mt-1 space-y-0">
        {agent.recentTools.map((tool, i) => (
          <div key={i} className="text-[10px] text-[var(--text-tertiary)] truncate">
            {i === agent.recentTools.length - 1 ? "▸" : "·"} {tool.toolName} {tool.inputPreview}
          </div>
        ))}
        {/* Pad to 3 lines for consistent height */}
        {Array.from({ length: Math.max(0, 3 - agent.recentTools.length) }).map((_, i) => (
          <div key={`pad-${i}`} className="text-[10px]">&nbsp;</div>
        ))}
      </div>
    </div>
  );
}
