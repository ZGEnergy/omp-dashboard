/**
 * Phase-2 slot: breadcrumb.
 *
 * Renders the most-recently-cached `kind: "breadcrumb"` descriptor as a
 * horizontal step indicator at the top of `FlowDashboard`. When multiple
 * breadcrumbs are pushed (rare; collision case), the last one in iteration
 * order wins — matches the spec contract documented in design.md §11.
 *
 * Step rendering:
 *   - status: "active" — highlighted (or matches `payload.current`)
 *   - status: "done"   — dimmed with check
 *   - status: "error"  — red
 *   - status: "pending" — neutral
 *
 * See change: add-extension-ui-decorations.
 */
import React from "react";
import { Icon } from "@mdi/react";
import { mdiCheck, mdiAlertCircle } from "@mdi/js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { decoratorsOfKind } from "./decorator-utils.js";

export function BreadcrumbSlot({ session }: { session: Pick<DashboardSession, "uiDecorators"> | undefined }) {
  if (!session) return null;
  const breadcrumbs = decoratorsOfKind(session.uiDecorators, "breadcrumb");
  if (breadcrumbs.length === 0) return null;
  // Last-write-wins on collision (most recently cached entry).
  const bc = breadcrumbs[breadcrumbs.length - 1]!;
  const { steps, current } = bc.payload;
  const activeId = current ?? steps.find((s) => s.status === "active")?.id;

  return (
    <div
      className="flex items-center gap-1 text-[11px] mb-2 flex-wrap"
      data-testid="breadcrumb-slot"
    >
      {steps.map((s, i) => {
        const isActive = s.id === activeId;
        const cls =
          s.status === "error"
            ? "text-red-400"
            : s.status === "done"
              ? "text-[var(--text-tertiary)]"
              : isActive
                ? "text-blue-400 font-medium"
                : "text-[var(--text-secondary)]";
        return (
          <React.Fragment key={s.id}>
            <span
              className={`inline-flex items-center gap-0.5 ${cls}`}
              data-testid={`breadcrumb-step:${s.id}`}
            >
              {s.status === "done" && <Icon path={mdiCheck} size={0.4} />}
              {s.status === "error" && <Icon path={mdiAlertCircle} size={0.4} />}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-[var(--text-tertiary)]">›</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
