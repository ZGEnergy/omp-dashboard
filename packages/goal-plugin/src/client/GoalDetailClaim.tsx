/**
 * GoalDetailClaim — `shell-overlay-route` claim for
 * `/folder/:encodedCwd/goals/:goalId`.
 *
 * Goal detail (mockup screen C), lighter v1: a definition panel (objective,
 * status controls, criteria) + a linked-sessions list. Each linked session
 * opens its REAL chat via in-app `navigate('/session/:id')` — including
 * auto-hidden driver/worker sessions, which stay `hidden` in the sidebar
 * (we never touch their hidden flag). Controls: `+ New session` (spawn +
 * goalId stamp at register), `Link existing…`, unlink, `⚑ driver` tag.
 *
 * See change: add-goals-folder-page (tasks 4.1, 4.3, 4.4).
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiRefresh, mdiPlus, mdiClose, mdiOpenInNew, mdiLinkVariant } from "@mdi/js";
import { useAllSessions } from "@blackbelt-technology/dashboard-plugin-runtime";
import type { GoalRecordStatus } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { useGoals, statusMeta } from "./useGoals.js";
import {
  decodeFolderPath,
  goalsBoardUrl,
  updateGoal,
  spawnSession,
  linkSession,
  unlinkSession,
} from "./goals-api.js";

const STATUS_ACTIONS: { status: GoalRecordStatus; label: string }[] = [
  { status: "pursuing", label: "Pursuing" },
  { status: "paused", label: "Paused" },
  { status: "achieved", label: "Achieved" },
];

export interface GoalDetailClaimProps {
  params: Record<string, string>;
  onBack: () => void;
}

export function GoalDetailClaim({ params, onBack }: GoalDetailClaimProps): React.ReactElement {
  const cwd = decodeFolderPath(params.encodedCwd ?? "") ?? "";
  const goalId = params.goalId ?? "";
  const [, navigate] = useLocation();
  const { goals, loading, error, refetch } = useGoals(cwd);
  const allSessions = useAllSessions();
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const goal = useMemo(() => goals.find((g) => g.id === goalId), [goals, goalId]);

  // Running sessions in this folder not already linked → "Link existing…" options.
  const linkable = useMemo(
    () => allSessions.filter((s) => s.cwd === cwd && !(goal?.sessionIds ?? []).includes(s.id)),
    [allSessions, cwd, goal?.sessionIds],
  );

  const sessionLabel = (sid: string): string => {
    const s = allSessions.find((x) => x.id === sid);
    return s?.name || sid.slice(0, 8);
  };

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setActionErr(null);
    try {
      await fn();
      refetch();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="px-3 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center gap-2 flex-shrink-0">
      <button onClick={onBack} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" title="Back">
        <Icon path={mdiArrowLeft} size={0.7} />
      </button>
      <button
        onClick={() => navigate(goalsBoardUrl(cwd))}
        className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        Goals
      </button>
      <span className="text-[var(--text-muted)]">›</span>
      <span className="text-sm font-medium text-[var(--text-primary)] flex-1 truncate">
        {goal?.objective ?? "Goal"}
      </span>
      <button onClick={refetch} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" title="Refresh">
        <Icon path={mdiRefresh} size={0.6} />
      </button>
    </div>
  );

  if (!goal) {
    return (
      <div className="flex flex-col h-full overflow-hidden" data-testid="goal-detail-page">
        {header}
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
          {loading ? "Loading goal…" : error ? error : "Goal not found."}
        </div>
      </div>
    );
  }

  const meta = statusMeta(goal.status);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="goal-detail-page">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {actionErr && <div className="text-xs text-red-400" data-testid="goal-detail-error">{actionErr}</div>}
        {/* Definition panel */}
        <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3" data-testid="goal-definition">
          <div className="text-sm text-[var(--text-primary)] font-medium">{goal.objective}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-[10px] px-1.5 py-px rounded-full border ${meta.cls}`}>{meta.dot} {meta.label}</span>
            <span className="flex-1" />
            {STATUS_ACTIONS.map((a) => (
              <button
                key={a.status}
                disabled={busy || goal.status === a.status}
                onClick={() => void run(() => updateGoal(cwd, goal.id, { status: a.status }))}
                className="text-[10px] px-1.5 py-px rounded border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {a.label}
              </button>
            ))}
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
        </section>

        {/* Linked sessions */}
        <section data-testid="goal-linked-sessions">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase">Linked sessions ({goal.sessionIds.length})</span>
            <span className="flex-1" />
            <button
              disabled={busy}
              onClick={() => void run(() => spawnSession(cwd, goal.id))}
              className="text-[10px] px-1.5 py-px rounded border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50 flex items-center gap-0.5"
              data-testid="goal-new-session"
            >
              <Icon path={mdiPlus} size={0.4} />New session
            </button>
            <button
              onClick={() => setLinking((v) => !v)}
              className="text-[10px] px-1.5 py-px rounded border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-0.5"
              data-testid="goal-link-existing"
            >
              <Icon path={mdiLinkVariant} size={0.4} />Link existing…
            </button>
          </div>

          {linking && (
            <div className="mb-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2 space-y-1" data-testid="goal-link-picker">
              {linkable.length === 0 && <div className="text-[10px] text-[var(--text-muted)]">No other running sessions in this folder.</div>}
              {linkable.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => void run(async () => { await linkSession(cwd, goal.id, s.id); setLinking(false); })}
                  className="block w-full text-left text-[11px] text-[var(--text-secondary)] hover:text-indigo-300 truncate"
                >
                  {s.name || s.id.slice(0, 8)}
                </button>
              ))}
            </div>
          )}

          {goal.sessionIds.length === 0 ? (
            <div className="text-[11px] text-[var(--text-muted)]">No sessions linked yet.</div>
          ) : (
            <ul className="space-y-1">
              {goal.sessionIds.map((sid) => (
                <li
                  key={sid}
                  className="flex items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-1"
                  data-testid="goal-session-row"
                >
                  {sid === goal.driverSessionId && <span title="driver">⚑</span>}
                  <span className="flex-1 text-[11px] text-[var(--text-secondary)] truncate font-mono">{sessionLabel(sid)}</span>
                  <button
                    onClick={() => navigate(`/session/${encodeURIComponent(sid)}`)}
                    className="text-[var(--text-tertiary)] hover:text-indigo-400"
                    title="Open chat"
                    data-testid="goal-open-session"
                  >
                    <Icon path={mdiOpenInNew} size={0.5} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void run(() => unlinkSession(cwd, goal.id, sid))}
                    className="text-[var(--text-tertiary)] hover:text-red-400 disabled:opacity-50"
                    title="Unlink"
                    data-testid="goal-unlink-session"
                  >
                    <Icon path={mdiClose} size={0.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
