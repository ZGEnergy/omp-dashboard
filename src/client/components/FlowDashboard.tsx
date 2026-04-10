import React, { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "@mdi/react";
import { mdiRobotOutline, mdiStop, mdiChevronUp, mdiChevronRight, mdiChevronDown, mdiFileDocumentOutline } from "@mdi/js";
import type { FlowState } from "../../shared/types.js";
import { FlowAgentCard } from "./FlowAgentCard.js";
import { FlowGraph, type FlowGraphStep } from "./FlowGraph.js";
import { FlowSummary } from "./FlowSummary.js";
import { FlowTabBar, type FlowTab } from "./FlowTabBar.js";
import { useMobile } from "../hooks/useMobile.js";

/** Map FlowState agents to FlowGraphStep array.
 *  blockedBy contains step IDs, but graph nodes use agent names — translate.
 *  Also includes flow-ref steps (subflows) if present. */
function agentsToGraphSteps(flowState: FlowState): FlowGraphStep[] {
  // Build stepId → agentName lookup
  const stepToAgent = new Map<string, string>();
  for (const agent of flowState.agents.values()) {
    if (agent.stepId) stepToAgent.set(agent.stepId, agent.agentName);
  }
  const agentSteps: FlowGraphStep[] = Array.from(flowState.agents.values()).map(agent => ({
    id: agent.agentName,
    label: agent.label || agent.agentName,
    status: agent.status,
    blockedBy: agent.blockedBy
      .map(depId => stepToAgent.get(depId) || depId)
      .filter(name => flowState.agents.has(name) || flowState.flowRefSteps?.some(r => r.id === name)),
  }));
  // Add flow-ref steps (subflows) with dashed border style
  const flowRefSteps: FlowGraphStep[] = (flowState.flowRefSteps || []).map(ref => ({
    id: ref.id,
    label: ref.label,
    status: "pending" as const,
    blockedBy: ref.blockedBy
      .map(depId => stepToAgent.get(depId) || depId),
    type: "flow-ref" as const,
  }));
  return [...agentSteps, ...flowRefSteps];
}

export function FlowDashboard({
  flowState,
  flowStates,
  onAgentClick,
  onAbort,
  onToggleAutonomous,
  onDismiss,
  onSendPrompt,
  onViewYaml,
}: {
  flowState: FlowState;
  /** All flow states (main + subflows) for tab navigation */
  flowStates?: Map<string, FlowState>;
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
  const [activeTabId, setActiveTabId] = useState<string>(flowState.flowName);
  const [followMode, setFollowMode] = useState(true);
  const prevFlowNameRef = useRef(flowState.flowName);

  // Build tab list from flowStates
  const tabs: FlowTab[] = useMemo(() => {
    if (!flowStates || flowStates.size <= 1) return [];
    return Array.from(flowStates.keys()).map(name => ({
      id: name,
      label: name,
      isActive: name === flowState.flowName,
    }));
  }, [flowStates, flowState.flowName]);

  // Follow mode: auto-switch to latest active flow
  useEffect(() => {
    if (followMode && flowState.flowName !== prevFlowNameRef.current) {
      setActiveTabId(flowState.flowName);
    }
    prevFlowNameRef.current = flowState.flowName;
  }, [followMode, flowState.flowName]);

  // Determine which flow state to display based on active tab
  const displayState = useMemo(() => {
    if (flowStates && activeTabId !== flowState.flowName) {
      return flowStates.get(activeTabId) || flowState;
    }
    return flowState;
  }, [flowStates, activeTabId, flowState]);

  const agents = Array.from(displayState.agents.values());
  const allAgents = Array.from(flowState.agents.values());
  const doneCount = allAgents.filter(a => a.status === "complete" || a.status === "error" || a.status === "blocked").length;
  const totalCount = allAgents.length;
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

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
    setFollowMode(false); // Manual click disables follow
  };

  const handleToggleFollow = () => {
    const newFollow = !followMode;
    setFollowMode(newFollow);
    if (newFollow) {
      // Re-enable: jump to latest active flow
      setActiveTabId(flowState.flowName);
    }
  };

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
          {/* Tab bar for multi-flow navigation */}
          <FlowTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            followMode={followMode}
            onTabClick={handleTabClick}
            onToggleFollow={handleToggleFollow}
          />

          <FlowGraph
            steps={agentsToGraphSteps(displayState)}
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
