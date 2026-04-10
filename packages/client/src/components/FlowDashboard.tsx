import React, { useState } from "react";
import { Icon } from "@mdi/react";
import { mdiRobotOutline, mdiStop, mdiChevronUp, mdiChevronRight, mdiChevronDown } from "@mdi/js";
import type { FlowState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { FlowAgentCard } from "./FlowAgentCard.js";
import { FlowGraph, type FlowGraphStep } from "./FlowGraph.js";
import { FlowSummary } from "./FlowSummary.js";
import { useMobile } from "../hooks/useMobile.js";

/** Map FlowState agents to FlowGraphStep array.
 *  blockedBy contains step IDs, but graph nodes use agent names — translate. */
function agentsToGraphSteps(flowState: FlowState): FlowGraphStep[] {
  // Build stepId → agentName lookup
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

export function FlowDashboard({
  flowState,
  onAgentClick,
  onAbort,
  onToggleAutonomous,
  onDismiss,
  onSendPrompt,
  onViewYaml,
}: {
  flowState: FlowState;
    onAgentClick: (agentName: string) => void;
    onAbort: () => void;
    onToggleAutonomous: () => void;
    onDismiss: () => void;
    onSendPrompt?: (text: string) => void;
    onViewYaml?: () => void;
}) {
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);
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
        onSendPrompt={onSendPrompt}
        onViewYaml={onViewYaml}
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
        <span
          className="inline-flex text-[var(--text-tertiary)] cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
        >
          <Icon path={collapsed ? mdiChevronRight : mdiChevronDown} size={0.6} />
        </span>
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
          <Icon path={mdiRobotOutline} size={0.4} className="inline mr-0.5" />AUTO
        </button>
        {isRunning && (
          <button
            onClick={(e) => { e.stopPropagation(); onAbort(); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10"
            title="Abort flow"
          >
            <Icon path={mdiStop} size={0.4} className="inline mr-0.5" />Abort
          </button>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileExpanded(false)}
            className="text-[10px] text-[var(--text-tertiary)]"
          >
            <Icon path={mdiChevronUp} size={0.4} className="inline mr-0.5" />collapse
          </button>
        )}
      </div>

      {/* DAG graph — structural minimap */}
      <div className={`group-collapse ${collapsed ? "collapsed" : "expanded"}`}>
        <div>
          <FlowGraph
            steps={agentsToGraphSteps(flowState)}
            onGraphClick={onViewYaml}
          />

          {/* Agent card grid — detailed per-agent info */}
          <div
            className="grid gap-2 mt-2"
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
      </div>
    </div>
  );
}
