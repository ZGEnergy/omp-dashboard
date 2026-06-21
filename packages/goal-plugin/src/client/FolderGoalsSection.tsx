/**
 * FolderGoalsSection — `sidebar-folder-section` slot claim.
 *
 * Sibling of the OpenSpec / Automations folder nav slots: shows
 * `Goals (N) →` (opens the goals board for this folder) plus a `+ Goal`
 * create affordance (inline objective capture → POST → navigate to board).
 *
 * Plugin-local: navigates the shell in-app via wouter's `useLocation`; no
 * core/shell edit. See change: add-goals-folder-page (tasks 3.1, 3.2).
 */
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Icon } from "@mdi/react";
import { mdiArrowRight, mdiPlus, mdiRefresh } from "@mdi/js";
import type { FolderDescriptor } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-props.js";
import { useGoals } from "./useGoals.js";
import { createGoal, goalsBoardUrl } from "./goals-api.js";

export function FolderGoalsSection({ folder }: { folder: FolderDescriptor }): React.ReactElement | null {
  const cwd = folder?.cwd;
  const [, navigate] = useLocation();
  const { goals, refetch } = useGoals(cwd);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!cwd) return null;

  const submit = async (): Promise<void> => {
    const objective = draft.trim();
    if (!objective || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await createGoal(cwd, { objective });
      setDraft("");
      setCreating(false);
      refetch();
      navigate(goalsBoardUrl(cwd));
    } catch (e) {
      // Keep the input open so the user can retry; show why it failed.
      setErr(e instanceof Error ? e.message : "Failed to create goal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="folder-goals-section" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 mt-1">
        <button
          data-testid="folder-goals-open-board"
          onClick={(e) => { e.stopPropagation(); navigate(goalsBoardUrl(cwd)); }}
          className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase hover:text-indigo-400"
          title="Open goals board"
        >
          <span>Goals ({goals.length})</span>
          <Icon path={mdiArrowRight} size={0.45} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); refetch(); }}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          title="Refresh"
          data-testid="folder-goals-refresh"
        >
          <Icon path={mdiRefresh} size={0.5} />
        </button>
        <span className="flex-1" />
        <button
          onClick={(e) => { e.stopPropagation(); setCreating((v) => !v); }}
          className="text-[10px] px-1.5 py-0.5 rounded border text-indigo-400 border-indigo-500/40 bg-indigo-500/5 hover:text-indigo-300 hover:border-indigo-500/70"
          data-testid="folder-goal-new-btn"
        >
          <Icon path={mdiPlus} size={0.4} className="inline mr-0.5" />Goal
        </button>
      </div>
      {creating && (
        <div className="flex items-center gap-1 mt-1" data-testid="folder-goal-create">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Goal objective…"
            className="flex-1 min-w-0 text-[10px] px-1.5 py-px rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] outline-none focus:border-indigo-400"
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setCreating(false); }}
          />
          <button
            className="text-[9px] px-1.5 py-px rounded border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50"
            disabled={!draft.trim() || busy}
            onClick={() => void submit()}
          >
            Create
          </button>
        </div>
      )}
      {err && <div className="mt-1 text-[10px] text-red-400" data-testid="folder-goal-error">{err}</div>}
    </div>
  );
}
