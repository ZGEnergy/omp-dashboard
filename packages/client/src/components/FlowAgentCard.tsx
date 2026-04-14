import React from "react";
import { Icon } from "@mdi/react";
import { mdiRefresh, mdiEyeOutline, mdiFileDocumentOutline } from "@mdi/js";
import type { FlowAgentState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { AgentCardShell } from "./AgentCardShell.js";
import { formatTokens, formatDuration } from "./agent-card-utils.js";

export function FlowAgentCard({
  agent,
  onClick,
  onViewSource,
  selected,
}: {
  agent: FlowAgentState;
  onClick?: () => void;
  onViewSource?: () => void;
  selected?: boolean;
}) {
  const displayName = agent.label || agent.stepId || agent.agentName;
  const displayRole = agent.cardRole || agent.model || "";
  const isComplete = agent.status === "complete" || agent.status === "error" || agent.status === "blocked";
  // Strip provider prefix for display (e.g., "anthropic/claude-opus-4-6" → "claude-opus-4-6")
  const displayModel = agent.resolvedModel
    ? (agent.resolvedModel.split("/").pop() ?? agent.resolvedModel)
    : "";
  const rawModel = agent.model || "";
  const hasAlias = rawModel.startsWith("@");

  // Step type badge for non-agent steps
  const stepTypeBadge = agent.stepType === "fork" || agent.stepType === "agent-decision"
    ? <span className="text-[9px] text-amber-400/70 bg-amber-400/10 px-1 rounded flex-shrink-0">◇ fork</span>
    : agent.stepType === "agent-loop-decision"
    ? <span className="text-[9px] text-purple-400/70 bg-purple-400/10 px-1 rounded flex-shrink-0">↻ loop</span>
    : null;

  const headerRight = agent.loopIteration != null && agent.loopIteration > 0 ? (
    <span className="text-[10px] text-blue-400 flex-shrink-0 inline-flex items-center gap-0.5">
      <Icon path={mdiRefresh} size={0.4} />{agent.loopIteration}/{agent.loopMax}
    </span>
  ) : stepTypeBadge;

  const stats = isComplete && agent.tokens ? (
    <span>↑{formatTokens(agent.tokens.input)} ↓{formatTokens(agent.tokens.output)} · {formatDuration(agent.duration ?? 0)}</span>
  ) : displayModel ? (
    <span>{displayModel}</span>
  ) : displayRole ? (
    <span>{displayRole}</span>
  ) : null;

  return (
    <AgentCardShell
      name={displayName}
      status={agent.status}
      headerRight={headerRight}
      stats={stats}
      selected={selected}
    >
      <div className="flex flex-col flex-1">
        {/* Model alias line (when model uses @role alias) */}
        {hasAlias && (
          <div className="text-[10px] text-[var(--text-tertiary)] truncate">{rawModel}</div>
        )}

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

        {/* View source / detail icons — bottom-right of card */}
        {(onViewSource || onClick) && (
          <div className="flex justify-end mt-auto pt-1 gap-1">
            {onViewSource && (
              <button
                onClick={(e) => { e.stopPropagation(); onViewSource(); }}
                className="text-[var(--text-tertiary)] hover:text-blue-400 transition-colors p-0.5 rounded hover:bg-[var(--bg-surface)] inline-flex items-center"
                title={`View ${displayName} source`}
              >
                <Icon path={mdiFileDocumentOutline} size={0.45} />
              </button>
            )}
            {onClick && (
              <button
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="text-[var(--text-tertiary)] hover:text-blue-400 transition-colors p-0.5 rounded hover:bg-[var(--bg-surface)] inline-flex items-center"
                title={`View ${displayName} detail`}
              >
                <Icon path={mdiEyeOutline} size={0.45} />
              </button>
            )}
          </div>
        )}
      </div>
    </AgentCardShell>
  );
}
