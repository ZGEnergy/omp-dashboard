import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "@mdi/react";
import { mdiChevronRight, mdiChevronDown } from "@mdi/js";
import type { DashboardSession, OpenSpecData } from "../../shared/types.js";
import {
  getActiveOnly,
  setActiveOnly as persistActiveOnly,
  getCollapsedGroups,
  setCollapsedGroups,
  pruneStaleCollapsedGroups,
  removeLegacyHiddenSessions,
} from "../lib/session-filter-storage.js";
import { SessionCard, GroupGitInfo, EditorButtons } from "./SessionCard.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { ThemePicker } from "./ThemePicker.js";
import { useEditors } from "../lib/use-editors.js";
import { openEditor } from "../lib/editor-api.js";
import { Toast, useToast } from "./Toast.js";

export interface ContextUsageInfo {
  tokens: number | null;
  contextWindow: number;
}

interface Props {
  sessions: DashboardSession[];
  selectedId?: string;
  onSelect: (sessionId: string) => void;
  contextUsageMap?: Map<string, ContextUsageInfo>;
  openspecMap?: Map<string, OpenSpecData>;
  onSendPrompt?: (sessionId: string, text: string) => void;
  onOpenSpecRefresh?: (sessionId: string) => void;
  onRename?: (sessionId: string, name: string) => void;
  onShutdown?: (sessionId: string) => void;
  onResume?: (sessionId: string, mode: "continue" | "fork") => void;
  onHideSession?: (sessionId: string) => void;
  onUnhideSession?: (sessionId: string) => void;
}

/** Group sessions by cwd, ordered by most recent activity. */
export function groupSessionsByDirectory(sessions: DashboardSession[]): Array<{ cwd: string; sessions: DashboardSession[] }> {
  const groups = new Map<string, DashboardSession[]>();
  for (const session of sessions) {
    const existing = groups.get(session.cwd);
    if (existing) {
      existing.push(session);
    } else {
      groups.set(session.cwd, [session]);
    }
  }

  // Sort groups by most recent session startedAt (descending)
  return Array.from(groups.entries())
    .map(([cwd, sessions]) => ({ cwd, sessions }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.startedAt));
      const bMax = Math.max(...b.sessions.map((s) => s.startedAt));
      return bMax - aMax;
    });
}

/** Apply filter pipeline: active-only → hidden → visible sessions */
export function filterSessions(
  sessions: DashboardSession[],
  activeOnly: boolean,
  showHidden: boolean,
): DashboardSession[] {
  return sessions.filter((s) => {
    if (activeOnly && s.status === "ended") return false;
    if (s.hidden && !showHidden) return false;
    return true;
  });
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 rounded border ${
        active
          ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
          : "border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

export function SessionList({ sessions, selectedId, onSelect, contextUsageMap, openspecMap, onSendPrompt, onOpenSpecRefresh, onRename, onShutdown, onResume, onHideSession, onUnhideSession }: Props) {
  const now = Date.now();
  const { messages, showToast, dismissToast } = useToast();

  // Detect editors for all unique cwds
  const cwds = useMemo(() => sessions.map((s) => s.cwd), [sessions]);
  const editorMap = useEditors(cwds);

  const handleOpenEditor = useCallback(async (cwd: string, editorId: string) => {
    const result = await openEditor(cwd, editorId);
    if (!result.success) {
      showToast(result.error ?? "Failed to open editor");
    }
  }, [showToast]);

  // Remove legacy client-side hidden storage on mount
  useEffect(() => {
    removeLegacyHiddenSessions();
  }, []);

  // Filter state - active-only defaults to ON
  const [activeOnly, setActiveOnly] = useState(() => getActiveOnly());
  const [showHidden, setShowHidden] = useState(false);

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroupsState] = useState(() => getCollapsedGroups());

  // Prune stale collapsed groups when sessions change
  useEffect(() => {
    if (sessions.length === 0) return;
    const knownCwds = new Set(sessions.map((s) => s.cwd));
    const prunedGroups = pruneStaleCollapsedGroups(knownCwds);
    setCollapsedGroupsState(prunedGroups);
  }, [sessions.length]);

  const handleActiveOnlyToggle = useCallback(() => {
    setActiveOnly((prev) => {
      const next = !prev;
      persistActiveOnly(next);
      return next;
    });
  }, []);

  const handleHide = useCallback((id: string) => {
    onHideSession?.(id);
  }, [onHideSession]);

  const handleToggleCollapse = useCallback((cwd: string) => {
    setCollapsedGroupsState((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) {
        next.delete(cwd);
      } else {
        next.add(cwd);
      }
      setCollapsedGroups(next);
      return next;
    });
  }, []);

  const handleUnhide = useCallback((id: string) => {
    onUnhideSession?.(id);
  }, [onUnhideSession]);

  const filteredSessions = useMemo(
    () => filterSessions(sessions, activeOnly, showHidden),
    [sessions, activeOnly, showHidden],
  );

  const hiddenCount = useMemo(() => {
    const afterActiveFilter = activeOnly
      ? sessions.filter((s) => s.status !== "ended")
      : sessions;
    return afterActiveFilter.filter((s) => s.hidden).length;
  }, [sessions, activeOnly]);

  const groups = groupSessionsByDirectory(filteredSessions);

  return (
    <div className="w-full border-r border-[var(--border-primary)] overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase">Sessions</h2>
          <div className="flex gap-1 items-center">
            <ThemePicker />
            <ThemeToggle />
            <ToggleButton active={activeOnly} onClick={handleActiveOnlyToggle}>
              Active only
            </ToggleButton>
            <ToggleButton active={showHidden} onClick={() => setShowHidden((p) => !p)}>
              Show hidden
            </ToggleButton>
          </div>
        </div>
      </div>
      {filteredSessions.length === 0 ? (
        <div className="p-4 text-sm text-[var(--text-tertiary)]">No active sessions</div>
      ) : (
        <ul>
          {groups.map((group) => {
            const dirName = group.cwd.split("/").pop() ?? group.cwd;
            const isCollapsed = collapsedGroups.has(group.cwd);

            return (
              <React.Fragment key={group.cwd}>
                {/* Group header — always shown */}
                <li
                  className="px-3 py-1.5 bg-[var(--bg-hover)] border-b border-[var(--border-primary)] cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleToggleCollapse(group.cwd)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex text-[var(--text-tertiary)]">
                      <Icon path={isCollapsed ? mdiChevronRight : mdiChevronDown} size={0.6} />
                    </span>
                    <span className="text-xs font-medium text-[var(--text-secondary)] truncate">📁 {dirName}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">({group.sessions.length})</span>
                  </div>
                  <GroupGitInfo sessions={group.sessions} />
                  {editorMap.get(group.cwd)?.length ? (
                    <div className="mt-1 ml-5">
                      <EditorButtons
                        editors={editorMap.get(group.cwd)!}
                        onOpen={(editorId) => {
                          // Prevent collapse toggle when clicking editor button
                          handleOpenEditor(group.cwd, editorId);
                        }}
                      />
                    </div>
                  ) : null}
                </li>
                {/* Session cards — animated collapse */}
                <div className={`group-collapse ${isCollapsed ? "collapsed" : "expanded"} space-y-1 p-1`}>
                  {group.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      selectedId={selectedId}
                      onSelect={onSelect}
                      now={now}
                      showGitInfo={group.sessions.length === 1}
                      isHidden={!!session.hidden}
                      onHide={handleHide}
                      onUnhide={handleUnhide}
                      editors={group.sessions.length === 1 ? editorMap.get(group.cwd) : undefined}
                      onOpenEditor={group.sessions.length === 1 ? (editorId) => handleOpenEditor(group.cwd, editorId) : undefined}
                      contextUsage={contextUsageMap?.get(session.id)}
                      openspecData={openspecMap?.get(session.id)}
                      onSendPrompt={onSendPrompt ? (text) => onSendPrompt(session.id, text) : undefined}
                      onOpenSpecRefresh={onOpenSpecRefresh ? () => onOpenSpecRefresh(session.id) : undefined}
                      onRename={onRename ? (name) => onRename(session.id, name) : undefined}
                      onShutdown={onShutdown}
                      onResume={onResume ? (mode) => onResume(session.id, mode) : undefined}
                    />
                  ))}
                </div>
              </React.Fragment>
            );
          })}
        </ul>
      )}
      {hiddenCount > 0 && !showHidden && (
        <div className="p-2 text-center text-[11px] text-[var(--text-muted)]">
          {hiddenCount} hidden
        </div>
      )}
      <Toast messages={messages} onDismiss={dismissToast} />
    </div>
  );
}
