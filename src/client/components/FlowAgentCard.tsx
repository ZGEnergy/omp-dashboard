import React from "react";
import { Icon } from "@mdi/react";
import { mdiRefresh } from "@mdi/js";
import type { FlowAgentState } from "../../shared/types.js";
import { AgentCardShell } from "./AgentCardShell.js";
import { formatTokens, formatDuration } from "./agent-card-utils.js";

export function FlowAgentCard({
  agent,
  onClick,
  selected,
}: {
  agent: FlowAgentState;
  onClick?: () => void;
  selected?: boolean;
}) {
  const displayName = agent.label || agent.agentName;
  const displayRole = agent.cardRole || agent.model || "";
  const isComplete = agent.status === "complete" || agent.status === "error" || agent.status === "blocked";

  const headerRight = agent.loopIteration != null && agent.loopIteration > 0 ? (
    <span className="text-[10px] text-blue-400 flex-shrink-0 inline-flex items-center gap-0.5">
      <Icon path={mdiRefresh} size={0.4} />{agent.loopIteration}/{agent.loopMax}
    </span>
  ) : undefined;

  const stats = isComplete && agent.tokens ? (
    <span>↑{formatTokens(agent.tokens.input)} ↓{formatTokens(agent.tokens.output)} · {formatDuration(agent.duration ?? 0)}</span>
  ) : displayRole ? (
    <span>{displayRole}</span>
  ) : null;

  return (
    <AgentCardShell
      name={displayName}
      status={agent.status}
      headerRight={headerRight}
      stats={stats}
      onClick={onClick}
      selected={selected}
    >
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
    </AgentCardShell>
  );
}
