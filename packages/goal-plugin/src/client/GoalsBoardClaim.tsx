/**
 * GoalsBoardClaim — `shell-overlay-route` claim for `/folder/:encodedCwd/goals`.
 *
 * Full-page goals board, structured like the OpenSpec board: header
 * (back / refresh / + New Goal), a status filter bar, then goal cards
 * (objective, status badge, progress = turns n/m + criteria, expandable
 * linked-sessions). Plugin-local; no App.tsx edit.
 *
 * See change: add-goals-folder-page (tasks 4.1, 4.2). Mockup screen B.
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiRefresh, mdiPlus, mdiChevronRight, mdiChevronDown } from "@mdi/js";
import { useSessionEvents } from "@blackbelt-technology/dashboard-plugin-runtime";
import type { GoalRecord, GoalRecordStatus } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { useGoals, statusMeta } from "./useGoals.js";
import { createGoal, decodeFolderPath, goalDetailUrl } from "./goals-api.js";
import { deriveSnapshot } from "./goal-state.js";

const FILTERS: { id: "all" | GoalRecordStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pursuing", label: "Pursuing" },
  { id: "paused", label: "Paused" },
  { id: "achieved", label: "Achieved" },
];

/** Reactive live-turn rollup for a goal's driver session (task 2.1). */
function GoalLiveProgress({ sessionId }: { sessionId?: string }): React.ReactElement | null {
  const events = useSessionEvents(sessionId ?? "");
  if (!sessionId) return null;
  const snap = deriveSnapshot(events);
  if (!snap) return null;
  return (
    <span className="text-[10px] font-mono text-[var(--text-tertiary)]" data-testid="goal-live-progress">
      {snap.status === "paused" ? "⏸" : "●"} {snap.turnsUsed}/{snap.maxTurns}
    </span>
  );
}

function GoalCard({ goal, onOpen }: { goal: GoalRecord; onOpen: () => void }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const meta = statusMeta(goal.status);
  const doneCriteria = goal.criteria.filter((c) => c.done).length;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3" data-testid="goal-card">
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="flex-1 text-left min-w-0" data-testid="goal-card-open">
          <div className="text-sm text-[var(--text-primary)] font-medium truncate">{goal.objective}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] px-1.5 py-px rounded-full border ${meta.cls}`}>
              {meta.dot} {meta.label}
            </span>
            <GoalLiveProgress sessionId={goal.driverSessionId} />
            {goal.criteria.length > 0 && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {doneCriteria}/{goal.criteria.length} criteria
              </span>
            )}
          </div>
        </button>
        {goal.sessionIds.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-[10px] flex items-center gap-0.5"
            data-testid="goal-card-expand"
          >
            <Icon path={expanded ? mdiChevronDown : mdiChevronRight} size={0.5} />
            {goal.sessionIds.length}
          </button>
        )}
      </div>
      {goal.criteria.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {goal.criteria.map((c, i) => (
            <li key={i} className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
              <span>{c.done ? "☑" : "☐"}</span>
              <span className={c.done ? "line-through opacity-60" : ""}>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
      {expanded && (
        <ul className="mt-2 space-y-0.5 border-t border-[var(--border-subtle)] pt-2" data-testid="goal-card-sessions">
          {goal.sessionIds.map((sid) => (
            <li key={sid} className="text-[10px] font-mono text-[var(--text-tertiary)] flex items-center gap-1">
              {sid === goal.driverSessionId && <span title="driver">⚑</span>}
              <span className="truncate">{sid}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface GoalsBoardClaimProps {
  params: Record<string, string>;
  onBack: () => void;
}

export function GoalsBoardClaim({ params, onBack }: GoalsBoardClaimProps): React.ReactElement {
  const cwd = decodeFolderPath(params.encodedCwd ?? "") ?? "";
  const [, navigate] = useLocation();
  const { goals, loading, error, refetch } = useGoals(cwd);
  const [filter, setFilter] = useState<"all" | GoalRecordStatus>("all");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? goals : goals.filter((g) => g.status === filter)),
    [goals, filter],
  );

  const submit = async (): Promise<void> => {
    const objective = draft.trim();
    if (!objective || !cwd) return;
    setCreateErr(null);
    try {
      await createGoal(cwd, { objective });
      setDraft("");
      setCreating(false);
      refetch();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create goal");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="goals-board-page">
      <div className="px-3 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" title="Back">
          <Icon path={mdiArrowLeft} size={0.7} />
        </button>
        <span className="text-sm font-medium text-[var(--text-primary)] flex-1 truncate">
          Goals · {cwd.split("/").pop() || cwd}
        </span>
        <button onClick={refetch} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" title="Refresh">
          <Icon path={mdiRefresh} size={0.6} />
        </button>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-[11px] px-2 py-0.5 rounded border text-indigo-400 border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-500/70 flex items-center gap-1"
          data-testid="goals-board-new"
        >
          <Icon path={mdiPlus} size={0.5} />New Goal
        </button>
      </div>

      {creating && (
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-2" data-testid="goals-board-create">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Goal objective…"
            className="flex-1 text-sm px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] outline-none focus:border-indigo-400"
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") setCreating(false); }}
          />
          <button className="text-xs px-2 py-1 rounded border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50" disabled={!draft.trim()} onClick={() => void submit()}>
            Create
          </button>
        </div>
      )}
      {createErr && <div className="px-3 py-1 text-xs text-red-400" data-testid="goals-board-create-error">{createErr}</div>}

      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 flex-shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${filter === f.id ? "text-indigo-300 border-indigo-500/70 bg-indigo-500/10" : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"}`}
            data-testid={`goals-filter-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {error && <div className="text-xs text-red-400">{error}</div>}
        {!error && loading && goals.length === 0 && (
          <div className="text-xs text-[var(--text-muted)]">Loading goals…</div>
        )}
        {!loading && visible.length === 0 && (
          <div className="text-xs text-[var(--text-muted)]" data-testid="goals-empty">
            {goals.length === 0 ? "No goals yet. Create one with + New Goal." : "No goals match this filter."}
          </div>
        )}
        {visible.map((g) => (
          <GoalCard key={g.id} goal={g} onOpen={() => navigate(goalDetailUrl(cwd, g.id))} />
        ))}
      </div>
    </div>
  );
}
