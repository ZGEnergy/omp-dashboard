/**
 * Phase-2 slot: agent-metric.
 *
 * Renders all `kind: "agent-metric"` descriptors whose `payload.agentId`
 * matches the agent rendered by the parent `FlowAgentCard`. Mounted inside
 * `FlowAgentCard.tsx`. Descriptors targeting an unknown agentId are
 * silently ignored (no orphan rendering).
 *
 * See change: add-extension-ui-decorations, design.md §6.
 */
import React from "react";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { decoratorsOfKind } from "./decorator-utils.js";

export function AgentMetricSlot({
  session,
  agentId,
}: {
  session: Pick<DashboardSession, "uiDecorators"> | undefined;
  agentId: string;
}) {
  if (!session) return null;
  const metrics = decoratorsOfKind(session.uiDecorators, "agent-metric").filter(
    (d) => d.payload.agentId === agentId,
  );
  if (metrics.length === 0) return null;
  return (
    <div
      className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate"
      data-testid="agent-metric-slot"
    >
      {metrics.map((d, i) => (
        <span
          key={`${d.namespace}:${d.id}`}
          title={d.payload.tooltip}
          className="inline-block"
          data-testid={`agent-metric:${d.namespace}:${d.id}`}
        >
          {i > 0 && <span className="mx-1 text-[var(--text-tertiary)]"> │ </span>}
          {d.payload.text}
        </span>
      ))}
    </div>
  );
}
