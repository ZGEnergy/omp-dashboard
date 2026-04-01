import React, { useState } from "react";
import type { FlowState } from "../../shared/types.js";
import { FlowAgentCard } from "./FlowAgentCard.js";
import { FlowSummary } from "./FlowSummary.js";
import { useMobile } from "../hooks/useMobile.js";

export function FlowDashboard({
  flowState,
  onAgentClick,
  onAbort,
  onToggleAutonomous,
  onDismiss,
}: {
  flowState: FlowState;
  onAgentClick: (agentName: string) => void;
  onAbort: () => void;
  onToggleAutonomous: () => void;
  onDismiss: () => void;
}) {
  const isMobile = useMobile();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const agents = Array.from(flowState.agents.values());
  const doneCount = agents.filter(a => a.status === "complete" || a.status === "error" || a.status === "blocked").length;
  const totalCount = agents.length;
  const isRunning = flowState.status === "running";
  const isComplete = !isRunning;

  // After completion, show summary
  if (isComplete) {
    return (
      <FlowSummary
        flowState={flowState}
        onAgentClick={onAgentClick}
        onDismiss={onDismiss}
      />
    );
  }

  // Mobile collapsed bar
  if (isMobile && !mobileExpanded) {
    return (
      <div
        onClick={() => setMobileExpanded(true)}
        className="px-3 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] cursor-pointer flex items-center gap-2"
      >
        <span className="text-blue-400 text-sm">π</span>
        <span className="text-sm text-[var(--text-primary)] truncate flex-1">
          {flowState.flowName} · {doneCount}/{totalCount} agents
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">tap to expand</span>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-blue-400 text-sm font-medium">π</span>
        <span className="text-sm text-[var(--text-primary)] truncate flex-1">
          {flowState.flowName}
          <span className="text-[var(--text-tertiary)] ml-1.5">{doneCount}/{totalCount} agents</span>
        </span>

        {/* Controls */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleAutonomous(); }}
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            flowState.autonomousMode
              ? "border-green-500/40 text-green-400 bg-green-500/10"
              : "border-[var(--border-subtle)] text-[var(--text-tertiary)]"
          }`}
          title="Toggle autonomous mode"
        >
          AUTO
        </button>
        {isRunning && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort(); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
            title="Abort flow"
          >
            Abort
          </button>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileExpanded(false)}
            className="text-[10px] text-[var(--text-tertiary)]"
          >
            collapse
          </button>
        )}
      </div>

      {/* Card grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}
      >
        {agents.map(agent => (
          <FlowAgentCard
            key={agent.agentName}
            agent={agent}
            onClick={() => onAgentClick(agent.agentName)}
          />
        ))}
      </div>
    </div>
  );
}
