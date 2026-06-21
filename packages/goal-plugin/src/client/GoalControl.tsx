/**
 * GoalControl — session-card-action-bar slot.
 *
 * Demoted (add-goals-folder-page, task 2.2): goal creation + live controls
 * (set / pause / resume / done / clear) now live at the folder level — the
 * `Goals (N) → / + Goal` nav slot and the goals board/detail pages. On the
 * session card this is a **read-only link chip** that navigates to the
 * owning goal's detail page. The "Set a goal…" input no longer appears here.
 *
 * Renders nothing when the session has no owning `goalId`.
 *
 * See change: add-goals-folder-page (task 2.2). Original control: see change
 * add-goal-continuation-plugin.
 */
import React from "react";
import { useLocation } from "wouter";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { goalDetailUrl } from "./goals-api.js";

export function GoalControl({
  session,
}: {
  session: DashboardSession;
}): React.ReactElement | null {
  const [, navigate] = useLocation();
  if (!session.goalId || !session.cwd) return null;

  return (
    <button
      data-testid="goal-control-link"
      onClick={(e) => { e.stopPropagation(); navigate(goalDetailUrl(session.cwd, session.goalId!)); }}
      className="text-[9px] px-1.5 py-px rounded border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 inline-flex items-center gap-1"
      title="Open this session's goal"
    >
      ⚑ Goal →
    </button>
  );
}
