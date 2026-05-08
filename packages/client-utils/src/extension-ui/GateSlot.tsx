/**
 * Phase-2 slot: gate.
 *
 * Renders gate state for a single flow inside `FlowLaunchDialog`. When any
 * `gate` descriptor for the matching `flowId` declares `available: false`,
 * the slot exposes a most-restrictive aggregate banner (parent uses
 * `useGateState` to disable the Run button + render the reason tooltip).
 *
 * See change: add-extension-ui-decorations, design.md §6 (most-restrictive-wins).
 */
import React from "react";
import { Icon } from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { decoratorsOfKind } from "./decorator-utils.js";

export interface GateState {
  available: boolean;
  /** Concatenated reasons from any `available: false` descriptors. */
  reason?: string;
}

/**
 * Pure helper: aggregate gate descriptors for a `flowId` into a single state.
 *
 * Most-restrictive-wins: any `available: false` makes the aggregate
 * unavailable; reasons from all contributing unavailable descriptors are
 * concatenated (newline-joined). When no descriptors target this flowId,
 * returns `{ available: true }` (fully open).
 */
export function aggregateGateState(
  decorators: Record<string, import("@blackbelt-technology/pi-dashboard-shared/types.js").DecoratorDescriptor> | undefined,
  flowId: string,
): GateState {
  const gates = decoratorsOfKind(decorators, "gate").filter((d) => d.payload.flowId === flowId);
  if (gates.length === 0) return { available: true };
  const blocked = gates.filter((d) => d.payload.available === false);
  if (blocked.length === 0) return { available: true };
  const reasons = blocked.map((d) => d.payload.reason).filter((r): r is string => typeof r === "string" && r.length > 0);
  return {
    available: false,
    reason: reasons.length > 0 ? reasons.join("\n") : undefined,
  };
}

export function GateSlot({
  session,
  flowId,
}: {
  session: Pick<DashboardSession, "uiDecorators"> | undefined;
  flowId: string;
}) {
  const state = aggregateGateState(session?.uiDecorators, flowId);
  if (state.available) return null;
  return (
    <div
      className="flex items-start gap-1 text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1 mb-2"
      title={state.reason}
      data-testid="gate-slot"
    >
      <Icon path={mdiAlertCircleOutline} size={0.5} className="flex-shrink-0 mt-0.5" />
      <span className="whitespace-pre-line">{state.reason ?? "Unavailable"}</span>
    </div>
  );
}
